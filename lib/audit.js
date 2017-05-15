const express = require('express');
const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const db = require(prj.LIB_PATH + '/db');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const csid = require(prj.LIB_PATH + '/csid');
const utils = require(prj.LIB_PATH + '/utils');
const async = require('asyncawait/async');
const await = require('asyncawait/await');

module.exports.ADTCODE = {
  /* User */
  USER_LOGIN:         0,
  USER_LOGOUT:        1,
  NEW_USER:           2,
  EDIT_USER:          3,
  DELETE_USER:        4,
  USER_ACTIVATE:      5,
  CHG_LANG:           6,

  /* Announce */
  NEW_ANNOUNCE:       7,
  EDIT_ANNOUNCE:      8,
  DELETE_ANNOUNCE:    9,

  /* Device */
  NEW_DEV:            10,
  EDIT_DEV:           11,
  DELETE_DEV:         12,
  DEV_IMPORT:         13,
  SND_FTP_LOG:        14,

  /* File Link */
  NEW_FLINK:          15,
  EDIT_FLINK:         16,
  DELETE_FLINK:       17,
  
  /* F/W Upgrade */
  SND_FWUPG:          18,

  /* Device Reboot */
  DEV_REBOOT:         19,

  /* Register */
  NEW_REG:            20,
  DUP_REG:            21,
  EDIT_REG:           22,
  SET_REG:            23,
  DELETE_REG:         24,

  /* Group */
  NEW_GROUP:          30,
  EDIT_GROUP:         31,
  DELETE_GROUP:       32,

  /* Others */
  CLEAR_EVTLOG:       40,
  CLEAR_ALARM:        41,
  CLEAR_AUDIT:        42,
  CLEAR_IOSTLOG:      43,

  /* Announce */
  ANNOUNCE_SUB_CMP:   44,
  ANNOUNCE_ALL_CMP:   45,
  
  /* Device Switch */
  SWITCH_MAC:         46,
  SWITCH_BACK:        47,
};

module.exports.log = (user, msgCode, message) => {
  let qStr = '';
  if(message) {
    let jStr = utils.toJsonStr(message, {__file, __line});
    if(!jStr) {
      return {err: 'invalid message!'};
    }
    qStr = 'INSERT LOW_PRIORITY INTO `' + db.TB_AUDIT_LOG + '` (`time`,`companyId`,`account`,`msgCode`,`message`) VALUES (UNIX_TIMESTAMP(now()),' + '\'' + user.companyId + '\',\'' + user.account + '\',\'' + msgCode + '\',\'' + jStr + '\');';
  } else {
    qStr = 'INSERT LOW_PRIORITY INTO `' + db.TB_AUDIT_LOG + '` (`time`,`companyId`,`account`,`msgCode`) VALUES (UNIX_TIMESTAMP(now()),' + '\'' + user.companyId + '\',\'' + user.account + '\',\'' + msgCode + '\');';
  }

  let dbsIdx = user.dbsIdx ? user.dbsIdx : 0;
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if(result.err) { dbg({__file, __line, err: result.err}); }
  return result;
};
