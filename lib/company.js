const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const db = require(prj.LIB_PATH + '/db');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const utils = require(prj.LIB_PATH + '/utils');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const self = module.exports;

module.exports.logout = (compName) => {
  // Force users of the company to logout
  let qStr = 'UPDATE `' + db.TB_SESSION + '` SET `session_id` = CONCAT(RAND(), SUBSTR(`session_id`, 16, LENGTH(`session_id`))), expires = 1470000000 WHERE `company` = \'' + compName + '\';';
  let result = await(db.pr_wquery(0, qStr));
  return result;
};

module.exports.getInfoByName = (compName) => {
  let querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = 'SELECT ' + i + ' AS `dbsIdx`,`company`,`parentId` FROM `' + db.TB_COMPANY + '` WHERE `company` = \'' + compName + '\' LIMIT 1;';
    querys[i] = db.pr_query(i, qStr);
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if (result.status === gstate.OK && result.data.length > 0) {
      return {data: result.data[0]};
    }
  }
  return {err: gstate.NO_RECORD};
};

module.exports.getInfo = (id) => {
  let querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = 'SELECT ' + i + ' AS `dbsIdx`,`company`,`parentId` FROM `' + db.TB_COMPANY + '` WHERE `id` = \'' + id + '\' LIMIT 1;';
    querys[i] = db.pr_query(i, qStr);
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if (result.status === gstate.OK && result.data.length > 0) {
      return {data: result.data[0]};
    }
  }
  return {err: gstate.NO_RECORD};
};

module.exports.getInfoByDbIdx = (dbsIdx, id) => {
  let qStr = 'SELECT `company`,`parentId` FROM `' + db.TB_COMPANY + '` WHERE `id` = \'' + id + '\' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if(result.status === gstate.OK && result.data.length > 0) {
      return {data: result.data[0]};
  } 
  return {err: gstate.NO_RECORD};
};

module.exports.hasSubCompany = (companyId, childId) => {
  let querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = 'SELECT ' + i + ' AS `dbsIdx`,`id`,`company` FROM `' + db.TB_COMPANY + '` WHERE `parentId` = \'' + companyId + '\' AND `id` = \'' + childId + '\' LIMIT 1;';
    querys[i] = db.pr_query(i, qStr);
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if (result.status === gstate.OK && result.data.length > 0) {
      return {data: result.data[0]};
    }
  }
  return {err: gstate.NO_RECORD};
};

module.exports.getDevices = (dbsIdx, companyId) => {
  let qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = \'' + companyId + '\';';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.status === gstate.OK && result.data.length > 0) {
    return {data: result.data};
  }
  return {err: gstate.NO_RECORD};
};

module.exports.logoutSubcomp = (user) => {
  info('Logout company ' + user.company + ' (' + user.companyId + '), Back to ' + user.company + ' (' + user._companyId + ')');
  user.dbsIdx = user._dbsIdx;
  user.companyId = user._companyId;
  user.name = user._name;
  delete user._dbsIdx;
  delete user._companyId;
  delete user._name;
};
