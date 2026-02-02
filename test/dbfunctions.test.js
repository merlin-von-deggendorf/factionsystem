import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  deleteDatabase,
  closeManagementPool,
} from '../databasemanagement.js';
import { migrateDatabase, initializeDatabase } from '../migrations.js';
import {
  register,
  login,
  createMessage,
  createPoll,
  votePoll,
  closePoll,
  getMessages,
  closeDbPool,
} from '../dbfunctions.js';
const dbName = process.env.DB_DATABASE;


before(async () => {
  await initializeDatabase();
  await migrateDatabase(true);
});

after(async () => {
  await closeDbPool();
  await deleteDatabase(dbName);
  await closeManagementPool();
});

test('register, login, messages, polls', async () => {
  const password = 'TestPassword123!';
  const users = [];

  for (let i = 0; i < 10; i += 1) {
    const username = `user_${i}`;
    const mail = `user_${i}@example.com`;
    const id = await register(username, password, mail);
    users.push({ id, username, mail });
    assert.ok(id > 0);
  }

  const { id: userId, username, mail } = users[0];
  await assert.rejects(
    register(username.toUpperCase(), password, 'other_0@example.com')
  );
  await assert.rejects(
    register('user_maildup', password, mail.toUpperCase())
  );
  await assert.rejects(
    register('u'.repeat(120), password, 'long@example.com')
  );
  await assert.rejects(
    register('user_longmail', password, 'm'.repeat(103))
  );

  const loginByUsername = await login(username, password);
  assert.equal(String(loginByUsername?.id), String(userId));
  assert.equal(loginByUsername?.username, username);
  assert.equal(loginByUsername?.mail, mail);

  const loginByMail = await login(mail, password);
  assert.equal(String(loginByMail?.id), String(userId));
  assert.equal(loginByMail?.username, username);
  assert.equal(loginByMail?.mail, mail);

  assert.equal(await login(username, 'wrong'), null);
  assert.equal(await login('missing-user', password), null);

  const pollMessageId = await createMessage(userId, 'user0 poll message');
  const expiredPollMessageId = await createMessage(
    userId,
    'user0 expired poll message'
  );
  for (let i = 0; i < 10; i += 1) {
    const id = await createMessage(userId, `user0 message ${i}`);
    assert.ok(id > 0);
  }

  const user1 = users[1];
  const multiPollMessageId = await createMessage(
    user1.id,
    'user1 multi poll message'
  );
  for (let i = 0; i < 2; i += 1) {
    const id = await createMessage(user1.id, `user1 message ${i}`);
    assert.ok(id > 0);
  }

  const singlePollId = await createPoll(pollMessageId, 'single', [
    'Option A',
    'Option B',
  ]);
  const expiredPollId = await createPoll(
    expiredPollMessageId,
    'single',
    ['Old A', 'Old B'],
    '2000-01-01 00:00:00'
  );
  const multiPollId = await createPoll(multiPollMessageId, 'multi', [
    'Red',
    'Green',
    'Blue',
  ]);

  const page1 = await getMessages(1, 10);
  assert.equal(page1.length, 10);
  assert.equal(page1[0].message, 'user0 poll message');
  for (const row of page1) {
    assert.ok(row.user_id);
    assert.ok(row.username);
    assert.ok(row.mail);
    assert.ok(Array.isArray(row.polls));
  }

  const page2 = await getMessages(2, 10);
  assert.equal(page2.length, 5);
  assert.ok(page2.some((row) => row.username === user1.username));

  const allMessages = await getMessages(1, 20);
  const singlePollMessage = allMessages.find(
    (row) => String(row.id) === String(pollMessageId)
  );
  assert.ok(singlePollMessage);
  assert.equal(singlePollMessage.polls.length, 1);
  assert.equal(singlePollMessage.polls[0].poll_type, 'single');
  assert.equal(singlePollMessage.polls[0].is_open, true);
  assert.equal(singlePollMessage.polls[0].options.length, 2);

  const expiredPollMessage = allMessages.find(
    (row) => String(row.id) === String(expiredPollMessageId)
  );
  assert.ok(expiredPollMessage);
  assert.ok(expiredPollMessage.polls[0].end_at);

  const multiPollMessage = allMessages.find(
    (row) => String(row.id) === String(multiPollMessageId)
  );
  assert.ok(multiPollMessage);
  assert.equal(multiPollMessage.polls[0].poll_type, 'multi');

  const singleOptions = singlePollMessage.polls[0].options;
  const expiredOptions = expiredPollMessage.polls[0].options;
  const multiOptions = multiPollMessage.polls[0].options;

  await assert.rejects(
    votePoll(singlePollId, user1.id, [
      singleOptions[0].id,
      singleOptions[1].id,
    ])
  );
  await votePoll(singlePollId, user1.id, singleOptions[0].id);
  await assert.rejects(
    votePoll(singlePollId, user1.id, singleOptions[1].id)
  );
  await votePoll(singlePollId, users[2].id, singleOptions[1].id);

  await votePoll(multiPollId, user1.id, [
    multiOptions[0].id,
    multiOptions[1].id,
  ]);
  await assert.rejects(
    votePoll(multiPollId, user1.id, multiOptions[1].id)
  );
  await votePoll(multiPollId, users[2].id, multiOptions[2].id);

  await assert.rejects(
    votePoll(expiredPollId, user1.id, expiredOptions[0].id)
  );

  assert.equal(await closePoll(singlePollId), true);
  await assert.rejects(
    votePoll(singlePollId, users[3].id, singleOptions[0].id)
  );

  const updatedMessages = await getMessages(1, 20);
  const updatedSingle = updatedMessages.find(
    (row) => String(row.id) === String(pollMessageId)
  );
  const updatedSinglePoll = updatedSingle.polls[0];
  assert.equal(updatedSinglePoll.is_open, false);
  const singleVoteCounts = new Map(
    updatedSinglePoll.options.map((option) => [option.id, option.vote_count])
  );
  assert.equal(singleVoteCounts.get(singleOptions[0].id), 1);
  assert.equal(singleVoteCounts.get(singleOptions[1].id), 1);

  const updatedMulti = updatedMessages.find(
    (row) => String(row.id) === String(multiPollMessageId)
  );
  const updatedMultiPoll = updatedMulti.polls[0];
  const multiVoteCounts = new Map(
    updatedMultiPoll.options.map((option) => [option.id, option.vote_count])
  );
  assert.equal(multiVoteCounts.get(multiOptions[0].id), 1);
  assert.equal(multiVoteCounts.get(multiOptions[1].id), 1);
  assert.equal(multiVoteCounts.get(multiOptions[2].id), 1);
});
