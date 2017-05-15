const express = require('express');
const fs = require('fs');
const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const device = require(prj.LIB_PATH + '/device');
const mbval = require(prj.LIB_PATH + '/mbval');
const db = require(prj.LIB_PATH + '/db');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const nconf = require('nconf');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');
const self = module.exports;
nconf.use('memory');

module.exports.create = (dbsIdx, companyId, sn) => {
  let time = Date.now();
  let qStr = 'CREATE TABLE IF NOT EXISTS `' + db.TB_MCACHE + '_' + sn + '` (' +
    '`time`  BIGINT UNSIGNED NOT NULL,' +
    '`type`  TINYINT         NOT NULL DEFAULT 0,' +
    '`key`   VARCHAR(32)     NOT NULL PRIMARY KEY,' +
    '`value` MEDIUMTEXT      NOT NULL,' +
    'INDEX(`time`)' +
    ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

  let result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) { info({__file, __line, err: result.err}); }
  return result;
};

// Similar to remove function, but just removes data from cache, instaed database
const delCache = (sn, keys) => {
  let time = Date.now();
  if(!keys) {
    nconf.clear(db.TB_MCACHE + ':' + sn);
    nconf.clear('MTIME:' + db.TB_MCACHE + ':' + sn);
    return;
  }
  if(Array.isArray(keys)) {
    for(let i = 0; i < keys.length; i++) {
      nconf.clear(db.TB_MCACHE + ':' + sn + ':' + keys[i]);
      nconf.clear('MTIME:' + db.TB_MCACHE + ':' + sn + ':' + keys[i]);
    }
  } else {
    nconf.clear(db.TB_MCACHE + ':' + sn + ':' + keys);
    nconf.clear('MTIME:' + db.TB_MCACHE + ':' + sn + ':' + keys);
  }
};
module.exports.delCache = delCache;

const getAll = (dbsIdx, sn, key) => {
  let qStr = 'SELECT `time`,`type`,`key`,`value` FROM `' + db.TB_MCACHE + '_' + sn + '` WHERE `key` LIKE \'' + key + ':%\' LIMIT 1000;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if(result.err || result.data.length === 0) {
    // dbg({__file, __line, err: 'dev ' + sn +', key/val ' + key + ' cant get timestampe!'});
    delCache(sn, key);
    return {};
  }
  for(let i = 0; i < result.data.length; i++) {
    let newTime = result.data[i].time;
    let mKey = db.TB_MCACHE + ':' + sn + ':' + result.data[i].key;
    let tKey = 'MTIME:' + db.TB_MCACHE + ':' + sn + ':' + result.data[i].key;

    // check type
    let newVal = result.data[i].value;
    let type = parseInt(result.data[i].type);
    if(type === 9) {
      delCache(sn, tKey);
      continue;
    } else if(type === 1) {
      newVal = utils.toJson(newVal, {__file, __line});
      if(typeof newVal === 'undefined') {
        continue;
      }
    }        
    // Set to cache
    nconf.set(mKey, newVal);
    nconf.set(tKey, newTime);
  }

  let ret = nconf.get(db.TB_MCACHE + ':' + sn + ':' + key);
  return ret ? ret : {};
};
module.exports.getAll = getAll;

const get = (dbsIdx, sn, key, type) => {
  let mKey = db.TB_MCACHE + ':' + sn + ':' + key;
  let tKey = 'MTIME:' + db.TB_MCACHE + ':' + sn + ':' + key;
  let oldVal = nconf.get(mKey);
  let oldTime = nconf.get(tKey);
  if((Date.now() - oldTime) < 100) {
    return (type && (type === 'int' || type === 'number')) ? parseInt(oldVal) : oldVal;
  }

  let qStr = 'SELECT `time` FROM `' + db.TB_MCACHE + '_' + sn + '` WHERE `key` = \'' + key + '\' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if(result.err || result.data.length === 0) {
    // dbg({__file, __line, err: 'dev ' + sn +', key ' + key + ' cant get timestampe!'});
    delCache(sn, key);
    return;
  }
  // timestamp no changed -> return from cache
  let newTime = result.data[0].time;
  if(oldTime && oldTime === newTime) {
    return (type && (type === 'int' || type === 'number')) ? parseInt(oldVal) : oldVal;
  }

  qStr = 'SELECT `time`,`type`,`value` FROM `' + db.TB_MCACHE + '_' + sn + '` WHERE `key` = \'' + key + '\' LIMIT 1;';
  result = await(db.pr_query(dbsIdx, qStr));
  if(result.err || result.data.length === 0) {
    // dbg({__file, __line, err: 'dev ' + sn +', key ' + key + ' cant get value from database!'});
    delCache(sn, key);
    return;
  }

  let dtype = parseInt(result.data[0].type);
  if(dtype === 9) {
    // dbg({__file, __line, err: 'dev ' + sn +', key ' + key + ' be removed from database!'});
    delCache(sn, key);
    return;
  }

  let newVal = result.data[0].value;
  if(dtype === 1) {
    newVal = utils.toJson(newVal, {__file, __line});
    if(typeof newVal === 'undefined') {
      return;
    }
  }

  // Set to cache
  if(oldVal !== newVal) {
    nconf.set(mKey, newVal);
    nconf.set(tKey, result.data[0].time);
  }
  return (type && (type === 'int' || type === 'number')) ? parseInt(newVal) : newVal;
};
module.exports.get = get;

const mget = (sn, key, type) => {
  let val = nconf.get(db.TB_MCACHE + ':' + sn + ':' + key);
  return (type && (type === 'int' || type === 'number')) ? parseInt(val) : val;
};
module.exports.mget = mget;

const set = (dbsIdx, sn, key, val) => {
  const time = Date.now();
  let json = 0;
  let origVal = val;
  if(typeof val === 'object') {
    json = 1;
    val = utils.toJsonStr(val, {__file, __line, sn});
    if(!val) {
      return;
    }
  }

  let qStr = 'INSERT INTO `' + db.TB_MCACHE + '_' + sn + '` (`time`,`type`,`key`,`value`) VALUES (\'' + time + '\',' + json + ', \'' + key + '\', \'' + val + '\') ON DUPLICATE KEY UPDATE `time` = VALUES(`time`), `type` = VALUES(`type`), `value` = VALUES(`value`);';
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    dbg({__file, __line, err: result.err});
  } else { // set cache
    nconf.set(db.TB_MCACHE + ':' + sn + ':' + key, origVal);
    nconf.set('MTIME:' + db.TB_MCACHE + ':' + sn + ':' + key, time);
  }
};
module.exports.set = set;

const setPairs = (dbsIdx, sn, pairs) => {
  if(!pairs) { return; }

  let first = true;
  let time = Date.now();
  let qStr = 'INSERT INTO `' + db.TB_MCACHE + '_' + sn + '` (`time`,`type`,`key`,`value`) VALUES ';
  let keys = Object.keys(pairs);
  for(let i = 0; i < keys.length; i++) {
    let key = keys[i];
    let val = pairs[key];
    let json = 0;
    if(typeof val === 'object') {
      json = 1;
      val = utils.toJsonStr(val, {__file, __line, sn});
      if(!val) {
        continue;
      }
    }
    if(first) {
      first = false;
    } else {
      qStr += ',';
    }
    qStr += '(\'' + time + '\',' + json + ',\'' + key + '\', \'' + val + '\')';
  }
  qStr += 'ON DUPLICATE KEY UPDATE `time` = VALUES(`time`), `type` = VALUES(`type`), `value` = VALUES(`value`);';

  let result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    dbg({__file, __line, err: result.err});
  } else { // set caches
    Object.keys(pairs).forEach((key) => {
      nconf.set(db.TB_MCACHE + ':' + sn + ':' + key, pairs[key]);
      nconf.set('MTIME:' + db.TB_MCACHE + ':' + sn + ':' + key, time);
    });
  }
};
module.exports.setPairs = setPairs;

// remove(dbsIdx, sn)         -> DROP `mcache_sn`
// remove(dbsIdx, sn, key)    -> DELETE FROM `mcache_sn` WHERE `key` IN ('MB-VAL:40001')
// remove(dbsIdx, sn, [keys]) -> DELETE FROM `mcache_sn` WHERE `key` IN ('MB-VAL:40001','MB-VAL:40002','MB-VAL:40003',...)
const remove = (dbsIdx, sn, keys) => {
  let qStr = '';
  if(keys) {
    let keyStr = '';
    if(Array.isArray(keys)) {
      for(let i = 0; i < keys.length; i++) {
        if(i > 0) { keyStr += ','; }
        keyStr += '\'' + keys[i] + '\'' ;
      }
    } else {
      keyStr = '\'' + keys + '\'';
    }
    if(keyStr) {
      qStr = 'DELETE IGNORE FROM `' + db.TB_MCACHE + '_' + sn + '` WHERE `key` IN (' + keyStr + ');';
    } else {
      return; // no any cache keys found!
    }
  } else {
    qStr = 'DELETE FROM `' + db.TB_MCACHE + '_' + sn + '`;'; // remove the whole table
  }
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    dbg({__file, __line, err: result.err});
  } else { // clear cache
    delCache(sn, keys);
  }
};
module.exports.remove = remove;

// removeAll(dbsIdx, sn, 'MB-VAL')  -> DELETE FROM `mcache_sn` WHERE `key` LIKE 'MB-VAL:%''
const removeAll = (dbsIdx, sn, key) => {
  let qStr = 'DELETE FROM `' + db.TB_MCACHE + '_' + sn + '` WHERE `key` LIKE \'' + key + ':%\';';
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    dbg({__file, __line, err: result.err});
  } else { // clear cache
    delCache(sn, key);
  }
};
module.exports.removeAll = removeAll;
