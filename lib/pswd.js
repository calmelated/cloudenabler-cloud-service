// check out https://github.com/visionmedia/node-pwd
const crypto = require('crypto');

/**
 * Bytesize.
 */
const len = 128;

/**
 * Iterations. ~300ms
 */
const iterations = 12000;

/**
 * Hashes a password with optional `salt`, otherwise
 * generate a salt for `pass` and invoke `fn(err, salt, hash)`.
 *
 * @param {String} password to hash
 * @param {String} optional salt
 * @param {Function} callback
 * @api public
 */
exports.hash = (pwd, salt, fn) => {
  if (3 === arguments.length) {
    crypto.pbkdf2(pwd, salt, iterations, len, fn);
  } else {
    fn = salt;
    crypto.randomBytes(len, (err, salt) => {
      if (err) { return fn(err); }
      salt = salt.toString('base64');
      crypto.pbkdf2(pwd, salt, iterations, len, (err, hash) => {
        if (err) { return fn(err); }
        fn(null, salt, hash);
      });
    });
  }
};

module.exports.md5 = (content) => {
  let md5 = crypto.createHash('md5');
  md5.update(content);
  return md5.digest('hex');
};