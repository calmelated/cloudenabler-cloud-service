const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const utils = require(prj.LIB_PATH + '/utils');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;
const hex2mac = require(prj.LIB_PATH + '/utils').hex2mac;
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const csid = require(prj.LIB_PATH + '/csid');
const mcache = require(prj.LIB_PATH + '/mcache');
const db = require(prj.LIB_PATH + '/db');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const self = module.exports;

module.exports.getAll = (dbsIdx, sn) => {
  return await(mcache.getAll(dbsIdx, sn, 'MB-VAL'));
};

module.exports.get = (dbsIdx, sn, addr) => {
  if(addr) {
    return await(mcache.get(dbsIdx, sn, 'MB-VAL:' + addr));
  } else {
    return await(self.getAll(dbsIdx, sn));
  }
};

module.exports.set = (dbsIdx, sn, addr, val) => {
  await(mcache.set(dbsIdx, sn, 'MB-VAL:' + addr, val));
};

module.exports.remove = (dbsIdx, sn, addr) => {
  await(mcache.remove(dbsIdx, sn, 'MB-VAL:' + addr));
};

module.exports.removeAll = (dbsIdx, sn) => {
  await(mcache.removeAll(dbsIdx, sn, 'MB-VAL'));
};

module.exports.delCache = (sn, addr) => {
  if(addr) {
    mcache.delCache(sn, 'MB-VAL:' + addr);
  } else {
    mcache.delCache(sn, 'MB-VAL');
  }
};
