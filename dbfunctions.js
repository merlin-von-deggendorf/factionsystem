import 'dotenv/config';
import mariadb from 'mariadb';
import bcrypt from 'bcrypt';

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

const BCRYPT_SALT_ROUNDS = 10;
const VALID_POLL_TYPES = new Set(['single', 'multi']);

function normalizePollOptions(options) {
  if (!Array.isArray(options)) {
    throw new Error('Poll options must be an array.');
  }

  const normalized = options.map((option) => {
    if (typeof option !== 'string') {
      throw new Error('Poll options must be strings.');
    }
    const trimmed = option.trim();
    if (!trimmed) {
      throw new Error('Poll options cannot be empty.');
    }
    return trimmed;
  });

  if (normalized.length < 2) {
    throw new Error('Polls require at least two options.');
  }

  return normalized;
}

function buildInClause(values) {
  return values.map(() => '?').join(', ');
}

export async function storeUser(username, password, mail) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const result = await pool.query(
    'INSERT INTO `usertable` (`username`, `password`, `mail`) VALUES (?, ?, ?)',
    [username, passwordHash, mail]
  );

  return result.insertId;
}

export async function checkPassword(usernameOrMail, password) {
  const rows = await pool.query(
    'SELECT `password` FROM `usertable` WHERE `username` = ? OR `mail` = ? LIMIT 1',
    [usernameOrMail, usernameOrMail]
  );

  if (rows.length === 0) return false;
  return bcrypt.compare(password, rows[0].password);
}

export async function register(username, password, mail) {
  return storeUser(username, password, mail);
}

export async function login(usernameOrMail, password) {
  const rows = await pool.query(
    'SELECT `id`, `username`, `mail`, `password` FROM `usertable` WHERE `username` = ? OR `mail` = ? LIMIT 1',
    [usernameOrMail, usernameOrMail]
  );

  if (rows.length === 0) return null;
  const ok = await bcrypt.compare(password, rows[0].password);
  if (!ok) return null;

  return {
    id: rows[0].id,
    username: rows[0].username,
    mail: rows[0].mail,
  };
}

export async function createMessage(userId, message) {
  const result = await pool.query(
    'INSERT INTO `messages` (`user_id`, `message`) VALUES (?, ?)',
    [userId, message]
  );
  return result.insertId;
}

export async function createPoll(messageId, pollType, options, endAt = null) {
  if (!VALID_POLL_TYPES.has(pollType)) {
    throw new Error('Invalid poll type.');
  }

  const normalizedOptions = normalizePollOptions(options);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const pollResult = await connection.query(
      'INSERT INTO `polls` (`message_id`, `poll_type`, `end_at`) VALUES (?, ?, ?)',
      [messageId, pollType, endAt]
    );
    const pollId = pollResult.insertId;

    const placeholders = normalizedOptions.map(() => '(?, ?, ?)').join(', ');
    const params = [];
    normalizedOptions.forEach((optionText, index) => {
      params.push(pollId, optionText, index);
    });

    await connection.query(
      `INSERT INTO \`poll_options\` (\`poll_id\`, \`option_text\`, \`position\`) VALUES ${placeholders}`,
      params
    );

    await connection.commit();
    return pollId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function votePoll(pollId, userId, optionIds) {
  const selectedOptions = Array.isArray(optionIds) ? optionIds : [optionIds];
  const uniqueOptions = [...new Set(selectedOptions)];

  if (uniqueOptions.length === 0) {
    throw new Error('No poll options selected.');
  }
  if (uniqueOptions.length !== selectedOptions.length) {
    throw new Error('Duplicate poll options are not allowed.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const pollRows = await connection.query(
      'SELECT `poll_type`, `is_open`, `end_at`, NOW() AS `now_value` FROM `polls` WHERE `id` = ? FOR UPDATE',
      [pollId]
    );
    if (pollRows.length === 0) {
      throw new Error('Poll not found.');
    }

    const poll = pollRows[0];
    if (!poll.is_open) {
      throw new Error('Poll is closed.');
    }
    if (poll.end_at && new Date(poll.end_at) <= new Date(poll.now_value)) {
      throw new Error('Poll has ended.');
    }

    if (poll.poll_type === 'single' && uniqueOptions.length !== 1) {
      throw new Error('Single choice polls only accept one option.');
    }

    const optionPlaceholders = buildInClause(uniqueOptions);
    const optionRows = await connection.query(
      `SELECT \`id\` FROM \`poll_options\` WHERE \`poll_id\` = ? AND \`id\` IN (${optionPlaceholders})`,
      [pollId, ...uniqueOptions]
    );
    if (optionRows.length !== uniqueOptions.length) {
      throw new Error('One or more poll options are invalid.');
    }

    if (poll.poll_type === 'single') {
      const insertResult = await connection.query(
        'INSERT INTO `poll_votes` (`option_id`, `user_id`) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM `poll_votes` pv INNER JOIN `poll_options` po ON po.id = pv.option_id WHERE pv.user_id = ? AND po.poll_id = ?)',
        [uniqueOptions[0], userId, userId, pollId]
      );
      if (insertResult.affectedRows === 0) {
        throw new Error('User already voted.');
      }
    } else {
      const existingRows = await connection.query(
        `SELECT \`option_id\` FROM \`poll_votes\` WHERE \`user_id\` = ? AND \`option_id\` IN (${optionPlaceholders})`,
        [userId, ...uniqueOptions]
      );
      if (existingRows.length > 0) {
        throw new Error('User already voted for one or more options.');
      }

      const valuesClause = uniqueOptions.map(() => '(?, ?)').join(', ');
      const params = [];
      uniqueOptions.forEach((optionId) => {
        params.push(optionId, userId);
      });
      await connection.query(
        `INSERT INTO \`poll_votes\` (\`option_id\`, \`user_id\`) VALUES ${valuesClause}`,
        params
      );
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function closePoll(pollId) {
  const result = await pool.query(
    'UPDATE `polls` SET `is_open` = 0 WHERE `id` = ?',
    [pollId]
  );
  return result.affectedRows > 0;
}

export async function getMessages(page = 1, pageSize = 10) {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;
  const rows = await pool.query(
    'SELECT `messages`.`id`, `messages`.`message`, `messages`.`created_at`, `usertable`.`id` AS `user_id`, `usertable`.`username`, `usertable`.`mail`, `polls`.`id` AS `poll_id`, `polls`.`poll_type`, `polls`.`is_open`, `polls`.`end_at`, `poll_options`.`id` AS `option_id`, `poll_options`.`option_text`, `poll_options`.`position` AS `option_position`, COALESCE(`vote_counts`.`vote_count`, 0) AS `vote_count` FROM (SELECT `id`, `user_id`, `message`, `created_at` FROM `messages` ORDER BY `id` ASC LIMIT ? OFFSET ?) AS `messages` INNER JOIN `usertable` ON `usertable`.`id` = `messages`.`user_id` LEFT JOIN `polls` ON `polls`.`message_id` = `messages`.`id` LEFT JOIN `poll_options` ON `poll_options`.`poll_id` = `polls`.`id` LEFT JOIN (SELECT `poll_votes`.`option_id`, COUNT(*) AS `vote_count` FROM `poll_votes` GROUP BY `poll_votes`.`option_id`) AS `vote_counts` ON `vote_counts`.`option_id` = `poll_options`.`id` ORDER BY `messages`.`id` ASC, `polls`.`id` ASC, `poll_options`.`position` ASC, `poll_options`.`id` ASC',
    [limit, offset]
  );

  const messages = [];
  const messageMap = new Map();

  for (const row of rows) {
    let message = messageMap.get(row.id);
    if (!message) {
      message = {
        id: row.id,
        message: row.message,
        created_at: row.created_at,
        user_id: row.user_id,
        username: row.username,
        mail: row.mail,
        polls: [],
        pollMap: new Map(),
      };
      messageMap.set(row.id, message);
      messages.push(message);
    }

    if (row.poll_id) {
      let poll = message.pollMap.get(row.poll_id);
      if (!poll) {
        poll = {
          id: row.poll_id,
          poll_type: row.poll_type,
          is_open: Boolean(row.is_open),
          end_at: row.end_at,
          options: [],
          optionSet: new Set(),
        };
        message.pollMap.set(row.poll_id, poll);
        message.polls.push(poll);
      }

      if (row.option_id && !poll.optionSet.has(row.option_id)) {
        poll.options.push({
          id: row.option_id,
          option_text: row.option_text,
          position: row.option_position,
          vote_count: Number(row.vote_count),
        });
        poll.optionSet.add(row.option_id);
      }
    }
  }

  for (const message of messages) {
    message.polls.forEach((poll) => {
      poll.options.sort((a, b) => a.position - b.position);
      delete poll.optionSet;
    });
    delete message.pollMap;
  }

  return messages;
}

export async function closeDbPool() {
  await pool.end();
}
