const express = require('express');
const fs = require('fs');
const asyncUtils = require('async');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const iosw = require(prj.LIB_PATH + '/iosw');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const device = require(prj.LIB_PATH + '/device');
const mbval = require(prj.LIB_PATH + '/mbval');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;
const db = require(prj.LIB_PATH + '/db');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const utils = require(prj.LIB_PATH + '/utils');
const nconf = require('nconf');
nconf.use('memory');

const getAll = (tb) => {
  if(tb.match(/^c/i)) {
    tb = db.TB_CONFIG;
  } else if(tb.match(/^s/i)) {
    tb = db.TB_STATUS;
  }
  // Get data from db
  let dbsIdx = 0;
  let qStr = 'SELECT `type`,`key`,`value` FROM `' + tb + '` LIMIT 1000;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if(result.err) { 
    dbg({__file, __line, err: result.err}); 
  }
  // update mcache
  let time = Date.now();
  for(let i = 0; i < result.data.length; i++) {
    let key = result.data[i].key;
    let value = result.data[i].value;
    if(parseInt(result.data[i].type) === 1) {
      value = utils.toJson(value, {__file, __line});
      if(typeof value === 'undefined') {
        continue;
      }        
    } 
    nconf.set(tb + ':' + key, value);
    nconf.set('MTIME:' + tb + ':' + key, time);
  }
  return result;
};
module.exports.getAll = getAll;

const mget = (tb, key, type) => {
  if(tb.match(/^c/i)) {
    tb = db.TB_CONFIG;
  } else if(tb.match(/^s/i)) {
    tb = db.TB_STATUS;
  }
  let ret = nconf.get(tb + ':' + key);
  if (type && (type === 'int' || type === 'number')) {
    ret = parseInt(ret);
  }
  return ret;
};
module.exports.mget = mget;

const get = (tb, key, type) => {
  if(tb.match(/^c/i)) {
    tb = db.TB_CONFIG;
  } else if(tb.match(/^s/i)) {
    tb = db.TB_STATUS;
  }

  let dbsIdx = 0; 
  let time = Date.now();
  let qStr = 'SELECT `type`,`value` FROM `' + tb + '` WHERE `key` = \'' +  key + '\' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if(result.err || result.data.length === 0) { 
    dbg({__file, __line, err: result.err}); 
    return mget(tb, key, type);
  }

  let oldVal = mget(tb, key, type);
  let newVal = result.data[0].value;
  if(parseInt(result.data[0].type) === 1) {
    newVal = utils.toJson(newVal, {__file, __line});
    if(typeof newVal === 'undefined') {
      return;
    }        
  } 
  if(oldVal !== newVal) {
    nconf.set(tb + ':' + key, newVal);
    nconf.set('MTIME:' + tb + ':' + key, Date.now());
  }
  return mget(tb, key, type);
};
module.exports.get = get;

const set = (tb, key, val) => {
  if(tb.match(/^c/i)) {
    tb = db.TB_CONFIG;
  } else if(tb.match(/^s/i)) {
    tb = db.TB_STATUS;
  }

  let json = 0;
  if(typeof val === 'object') {
    json = 1;
    val = utils.toJsonStr(val, {__file, __line});
    if(!val) {
      return {err: gstate.INVALID_DATA};
    }
  }
   
  let dbsIdx = 0;
  let time = Date.now();
  let qStr = 'UPDATE `' + tb + '` SET `time` = \'' + time + '\',`type` = ' + json + ',`value` = \'' + val + '\' WHERE `key` = \'' + key + '\' ;';
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if(result.err) { 
    info({__file, __line, err: result.err}); 
    return result;
  }

  nconf.set(tb + ':' + key, val);
  nconf.set('MTIME:' + tb + ':' + key, time);
  return result;
};
module.exports.set = set;

const sync = (tbName, forceClean) => {
  let time = Date.now();
  const _sync_ = (tbName, pairs, forceClean) => {
    let keys = Object.keys(pairs);
    let qStr = (forceClean) ? ('TRUNCATE `' + tbName + '`; ') : '';
    qStr += 'INSERT INTO `' + tbName + '` (`time`, `key`, `value`) VALUES (\'' + time + '\', \'' + keys[0] + '\', \'' + pairs[keys[0]] + '\')';
    for (let i = 1; i < keys.length; i++) {
      qStr += ',(\'' + time + '\', \'' + keys[i] + '\', \'' + pairs[keys[i]] + '\')';
    }
    qStr += ' ON DUPLICATE KEY UPDATE `key` = `key`;';
    return qStr;
  };

  let qStr = '';
  if(tbName === 'both') {
    qStr += _sync_(db.TB_CONFIG, require(prj.DEF_CSID).C, forceClean);
    qStr += _sync_(db.TB_STATUS, require(prj.DEF_CSID).S, forceClean);
  } else if(tbName.match(/^c/i)) {
    qStr += _sync_(db.TB_CONFIG, require(prj.DEF_CSID).C, forceClean);
  } else if(tbName.match(/^s/i)){
    qStr += _sync_(db.TB_STATUS, require(prj.DEF_CSID).S, forceClean);
  } else {
    let err = 'Unknown table ' + tbName;
    dbg({__file, __line, err});
    return {err};
  }

  let dbsIdx = 0;
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    dbg({__file, __line, err: result.err});
    return result;
  }

  let msg = (result.data[0].message).split(' ');
  let cfgChgs = parseInt(msg[1]) - parseInt(msg[4]);
  let statChgs = 0;
  if(result.data[1]) {
    msg = (result.data[1].message).split(' ');
    statChgs = parseInt(msg[1]) - parseInt(msg[4]);
  }
  return {data: {
    success: true,
    status: 'Synchronize successfully !',
    numChgs: cfgChgs + statChgs,
  }};
};
module.exports.sync = sync;

const init = () => {
  let result = await(sync('both', false));  // sync csid
  if(result.err) { info({__file, __line, err: 'CSID sync error!'}); }
  return result;
};
module.exports.init = init;
