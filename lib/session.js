const prj = require('../project');
const db = require(prj.LIB_PATH + '/db');
const session = require('express-session');
const MySQLSession = require('express-mysql-session');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const csid = require(prj.LIB_PATH + '/csid');
const gstate = require(prj.GSTATE_PATH);
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');

const lastStore = {};
const lastWrIdx = {};

module.exports.store = (dbsIdx) => {
  let wrIdx = prj.DBS[dbsIdx].WIDX;
  if(!lastStore[dbsIdx] || lastWrIdx[dbsIdx] !== wrIdx) {
    dbg('Changed to wrIdx = ' + wrIdx);
    lastWrIdx[dbsIdx] = wrIdx;
    lastStore[dbsIdx] = new MySQLSession({
      host: prj.DBS[dbsIdx].POOLS[wrIdx].ADDR,
      port: prj.DBS[dbsIdx].POOLS[wrIdx].PORT,
      user: prj.DBS[dbsIdx].POOLS[wrIdx].USER,
      password: prj.DBS[dbsIdx].POOLS[wrIdx].PSWD,
      database: db.DB_MMC,
      checkExpirationInterval: 300000, // How frequently expired sessions will be cleared; milliseconds.
      expiration: csid.mget('C','SESSION_AGE','int'), // The maximum age of a valid session; milliseconds.
      useConnectionPooling: true,
      autoReconnect: true,
    });   
  } 
  return lastStore[dbsIdx];
};

module.exports.getAll = () => {
  let qStr = 'SELECT `session_id` AS `session`, `expires`,`company`,`account` FROM `' + db.TB_SESSION + '` WHERE `company` <> \'\' AND `account` <> \'\';';
  let result = await(db.pr_query(0, qStr));
  if (result.err || result.data.length === 0) {
    return {err: gstate.NO_RECORD};
  }
  return {data: result.data};
};

module.exports.get = (sid) => {
  let qStr = 'SELECT `session_id` AS `session`,`expires`,`data` FROM `' + db.TB_SESSION + '` WHERE `session_id` = \'' + sid + '\' LIMIT 1;';
  let result = await(db.pr_query(0, qStr));
  if (result.err || result.data.length === 0) {
    return {err: gstate.NO_RECORD};
  } else {
    return {data: result.data[0]};
  }
};

// by route/debug.js
module.exports.getByCompany = (dbsIdx, companyId) => {
  let qStr = 'SELECT `company` FROM `' + db.TB_COMPANY + '` WHERE `id` = \'' + companyId + '\';';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err || result.data.length === 0) {
    return {err: gstate.NO_COMP};
  }

  let company = result.data[0].company;
  qStr = 'SELECT `session_id` AS `session`,`expires`,`account` FROM `' + db.TB_SESSION + '` WHERE `company` = \'' + company + '\';';
  result = await(db.pr_query(0, qStr));
  if(result.err || result.data.length === 0) {
    return {err: gstate.NO_RECORD};
  } else {
    return {data: result.data};
  }
};

module.exports.hasLastSession = (curSid, company, account) => {
  let qStr = 'SELECT `session_id` AS `session`,`expires` FROM `' + db.TB_SESSION + '` WHERE `company` = \'' + company + '\' AND `account` = \'' + account + '\' ;';
  let result = await(db.pr_query(0, qStr));
  if (result.err || result.data.length === 0) {
    return {err: gstate.NO_RECORD};
  }
  
  let nowTime = new Date().getTime();
  for (let j = 0; j < result.data.length; j++) {
    let data = result.data[j];
    if(data.session !== curSid) {
      let expiresTime = (new Date(data.expires)).getTime();
      if (expiresTime <= nowTime) {
        return {data: data.session};
      }
    }
  }
  return {err: gstate.NO_RECORD}; // Not found
};

module.exports.clear = (sid) => {
  let filter = (sid) ? 'WHERE `session_id` = \'' + sid + '\''  : '' ;
  let qStr = 'DELETE FROM `' + db.TB_SESSION + '` ' + filter + ' ; ';
  return await(db.pr_wquery(0, qStr));
};

module.exports.logout = (sid) => {
  let qStr = 'UPDATE `' + db.TB_SESSION + '` SET `session_id` = CONCAT(RAND(), SUBSTR(`session_id`, 16, LENGTH(`session_id`))), expires = 1470000000 WHERE `company` = \'' + sid + '\';';
  return await(db.pr_wquery(0, qStr));
};

module.exports.contain = (sid) => {
  let qStr = 'SELECT `session_id` AS `session` FROM `' + db.TB_SESSION + '` WHERE `session_id` = \'' + sid + '\'; ' ;
  let result = await(db.pr_query(0, qStr));
  return (result.err || result.data.length === 0) ? false : true;
};
