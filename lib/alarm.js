const express = require('express');
const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const LANG = require(prj.LIB_PATH + '/lang');
const db = require(prj.LIB_PATH + '/db');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const nodemailer = require('nodemailer');
const csid = require(prj.LIB_PATH + '/csid');
const device = require(prj.LIB_PATH + '/device');
const utils = require(prj.LIB_PATH + '/utils');
const asyncUtils = require('async');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const https = require('https');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const iotype = require(prj.ROOT_PATH + '/public/js/iotype');
const model = require(prj.ROOT_PATH + '/public/js/model');

// TYPE
const PUSH  = 1;
const EMAIL = 2;

const ALMSTAT = {
  PUSH_OK: 0,
  PUSH_NO_RECV: 1,
  PUSH_FAIL: 2,
  PUSH_PART_FAIL: 3,
  EMAIL_OK: 4,
  EMAIL_NO_RECV: 5,
  EMAIL_FAIL: 6,
  EMAIL_PART_FAIL: 7,
  DEV_DISABLED: 8,
  NO_DEV: 9,
  DB_FAIL: 10,
};

const ALMCODE = {
  USER_DEFINED: 0,
  OFFLINE: 1,
  RESET_PSWD: 2,
  ONLINE: 3,
  LOG_FAILED: 4,
  FEW_ALARM: 5,
  NO_AVAIL_ALARM: 6,
  UPPER_LIMIT_ALARM: 7,
  LOWER_LIMIT_ALARM: 8,
  NEW_ANNOUNCE: 9,
  SLVDEV_OFFLINE: 10,
  SLVDEV_ONLINE: 11,
  BACK_NORMAL_ALARM: 12,
  MBUS_MST_ONLINE: 13,
  MBUS_MST_OFFLINE: 14,
  DEV_REBOOT: 15,
};
module.exports.ALMCODE = ALMCODE;

const langStrSrcDev = (lgConf, almObj) => {
  if(!almObj.sn) {
    return '';
  }
  let dbsIdx = utils.has(almObj.dbsIdxChild) ? almObj.dbsIdxChild : almObj.dbsIdx;
  let devConf = await(device.get(dbsIdx, almObj.sn));
  if(!devConf) {
    return '';
  }
  let ret = '';
  if(devConf.name) {
    ret = ret + devConf.name;
  }
  if(almObj.slvIdx && almObj.slvIdx > 0) {
    ret = ret + ' -> ' + devConf.slvDev[almObj.slvIdx];
  }
  return ret;
};

const langStr = (type, lgConf, almObj) => {
  let msgCode = almObj.msgCode;
  let message = almObj.message;
  if(msgCode === ALMCODE.USER_DEFINED ||
     msgCode === ALMCODE.RESET_PSWD
  ) {
    return message;
  }

  let devConf;
  let devName = "undefined";
  if(almObj.sn) {
    let dbsIdx = utils.has(almObj.dbsIdxChild) ? almObj.dbsIdxChild : almObj.dbsIdx;
    devConf = await(device.get(dbsIdx, almObj.sn));
    if(devConf && devConf.name) {
      devName = devConf.name;
    }
  }

  let result;
  if(msgCode === ALMCODE.ONLINE) {
    let duration = message.split('duration: ');
    if(duration.length > 1) {
      result = LANG[lgConf].device + ' ' + devName + LANG[lgConf].device_online_duration + duration[1];
    } else {
      result = LANG[lgConf].device + ' ' + devName + LANG[lgConf].device_online;
    }
  } else if(msgCode === ALMCODE.OFFLINE) {
    result = LANG[lgConf].device + ' ' + devName + LANG[lgConf].device_offline;
  } else if(msgCode === ALMCODE.LOG_FAILED) {
    result = LANG[lgConf].device + ' ' + devName + LANG[lgConf].device_fail_logging;
  } else if(msgCode === ALMCODE.FEW_ALARM) {
    result = LANG[lgConf].few_alarm_left;
  } else if(msgCode === ALMCODE.NO_AVAIL_ALARM) {
    result = LANG[lgConf].no_avaliable_alarm;
  } else if(msgCode === ALMCODE.UPPER_LIMIT_ALARM || msgCode === ALMCODE.BACK_NORMAL_ALARM || msgCode === ALMCODE.LOWER_LIMIT_ALARM) {
    if(msgCode === ALMCODE.UPPER_LIMIT_ALARM) {
      result = almObj.extra.desc + LANG[lgConf].upper_limit_alarm;
    } else if(msgCode === ALMCODE.BACK_NORMAL_ALARM) { 
      result = almObj.extra.desc + LANG[lgConf].back_normal_alarm;
    } else if(msgCode === ALMCODE.LOWER_LIMIT_ALARM) { 
      result = almObj.extra.desc + LANG[lgConf].lower_limit_alarm;
    }
    let dot = false;
    if(utils.has(almObj.extra.value)) {
      result += ' ' + LANG[lgConf].value + ': ' + almObj.extra.value + ' ' + almObj.extra.unit;
      dot = true;
    }
    if(utils.has(almObj.extra.conf)) {
      result += (dot ? ',' : '') + ' ' + LANG[lgConf].conf + ': ' + almObj.extra.conf;
    }
    if(type === PUSH) {
      let first = true;
      for(let rr of ['rr1','rr2','rr3','rr4']) {
        if(!utils.has(almObj.extra[rr])) {
          continue;
        }
        result += (first ? ' (' : ', ') + almObj.extra[rr + '_desc'] + ': ' + almObj.extra[rr + '_value'] + almObj.extra[rr + '_unit'];
        first = false;
      }
      result += first ? '' : ')';
    }
  } else if(msgCode === ALMCODE.NEW_ANNOUNCE) {
    result = LANG[lgConf].new_announce;
  } else if(msgCode === ALMCODE.SLVDEV_ONLINE) {
    result = LANG[lgConf].slvdev + ' ' + devName + ' -> ' + almObj.extra.slvName + ' ' + LANG[lgConf].device_online;
  } else if(msgCode === ALMCODE.SLVDEV_OFFLINE) {
    result = LANG[lgConf].slvdev + ' ' + devName + ' -> ' + almObj.extra.slvName + ' ' + LANG[lgConf].device_offline;
  } else if(msgCode === ALMCODE.MBUS_MST_ONLINE) {
    result = LANG[lgConf].device + ' ' + devName + ' ' + LANG[lgConf].mbus_mst_online;
  } else if(msgCode === ALMCODE.MBUS_MST_OFFLINE) {
    result = LANG[lgConf].device + ' ' + devName + ' ' + LANG[lgConf].mbus_mst_offline;        
  } else if(msgCode === ALMCODE.DEV_REBOOT) {
    if(almObj.extra.duration) {
      result = LANG[lgConf].device + ' ' + devName + LANG[lgConf].device_reboot_duration + almObj.extra.duration;
    } else {
      result = LANG[lgConf].device + ' ' + devName + LANG[lgConf].device_reboot;
    }
  }
  return result;
};

// Only for upper/lower limit email 
const getRRmsg = (lgConf, almObj) => {
  let msgCode = almObj.msgCode;
  if(!(msgCode === ALMCODE.UPPER_LIMIT_ALARM || 
       msgCode === ALMCODE.BACK_NORMAL_ALARM || 
       msgCode === ALMCODE.LOWER_LIMIT_ALARM)) {
    return;
  }
  let result = '';
  for(let rr of ['rr1','rr2','rr3','rr4']) {
    if(!utils.has(almObj.extra[rr])) {
      continue;
    }
    result += '<tr><td><strong>' + almObj.extra[rr + '_desc'] + '</strong></td><td>' + almObj.extra[rr + '_value'] + almObj.extra[rr + '_unit'] + '</td><tr>';
  }
  return result ? LANG[lgConf].rr_str + result : result;
};

const logAlarm = async((almObj) => {
  if(almObj.msgCode === ALMCODE.NEW_ANNOUNCE) {
    return {};
  }
  let dbsIdx = almObj.dbsIdx;
  let extVal = (almObj.extra) ? utils.toJsonStr(almObj.extra) : null ;
  let qStr = 'INSERT INTO `' + db.TB_ALARM_LOG + '` (`time`,`companyId`,`account`,`status`,`msgCode`,`priority`,`message`,`sn`,`addr`,`extra`) VALUES (' +
         '\'' + almObj.time        + '\',' +
         '\'' + almObj.companyId   + '\',' +
         '\'' + (((almObj.status === ALMSTAT.PUSH_FAIL) && almObj._account) ? almObj._account : almObj.account)  + '\',' +
         '\'' + almObj.status      + '\',' +
         '\'' + almObj.msgCode     + '\',' +
         '\'' + ((almObj.priority) ? almObj.priority :  0)     + '\',' +
         ''   + ((almObj.message)  ? '\'' + almObj.message + '\'' : 'NULL') + ',' +
         ''   + ((almObj.sn)       ? 'UNHEX(\'' + almObj.sn + '\')' : 'NULL') + ',' +
         ''   + ((almObj.addr)     ? '\'' + almObj.addr.toString().split('-')[0] + '\''    : 'NULL') + ',' +
         ''   + ((extVal)          ? '\'' + extVal + '\'' : 'NULL') + ');';

  let result = await(db.pr_wquery(dbsIdx, qStr));
  if(result.err) { dbg({__file, __line, err: result.err}); }
  return result;
});

const pushReq = (httpHdr, data, retry, doFwd, callback) => {
  if(doFwd) { // Use US proxy if LeanCloud CN is being blocked
    httpHdr.host = prj.LCUS_PROXY;
    httpHdr.path = (httpHdr.host === prj.LCUS_HOST) ? '/1.1/us-push' : httpHdr.path ;
  }
  const req = https.request(httpHdr, (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      // console.log('Response: ' + chunk);
      return callback();
    });
  });
  req.on('socket', (socket) => {
    socket.setTimeout(10000);
    socket.on('timeout', function() {
      info('Socket timeout!');
      req.abort();
    });
  });
  req.on('error', (e) => {
    retry++;
    if(retry < 3) {
      info('Socket error! Resend the notification again! retry = ' + retry);
      pushReq(httpHdr, data, retry, false, callback);
    } else if(retry < 5) {
      info('Socket error! Forward the notification to Proxy server, retry = ' + retry);
      pushReq(httpHdr, data, retry, true, callback);
    } else if(retry < 7) {
      info('Socket error! Resend the notification after ' + (retry * 10000));
      setTimeout(() => {
        pushReq(httpHdr, data, retry, false, callback);
      }, (retry * 10000));
    } else {
      return callback('Socket error! Drop the notification ');
    }
  });
  req.write(data);
  req.end();
};

// Promise pushReq()
const prPushReq = (httpHdr, data, retry, doFwd) => {
  return new Promise((resolve, reject) => {
    pushReq(httpHdr, data, retry, doFwd, (err, result) => {
      return resolve(err, result);        
    });
  });
};

const lcPush = (almObj, callback) => {
  let pushObjs = almObj.pushObjs;
  if(!Array.isArray(pushObjs)) {
    pushObjs = [pushObjs];
  }
  if(pushObjs.length === 0) {
    almObj.status = ALMSTAT.PUSH_NO_RECV;
    logAlarm(almObj);
    return callback(gstate.NO_RECORD);
  }
  try {
    almObj.message = (almObj.message) ? ((almObj.message.length > 1024) ? almObj.message.substr(0, 1024) : almObj.message) : '' ;
    asyncUtils.times(pushObjs.length, async((i, next) => {
      pushObjs[i].type = (pushObjs[i].type) ? parseInt(pushObjs[i].type) : 0;

      const idx = pushObjs[i].type;
      const httpHdr = {
        host: prj.LC_CONFS[idx].HOST,
        port: '443',
        path: '/1.1/push',
        method: 'POST',
        headers: {
          'X-AVOSCloud-Application-Id': prj.LC_CONFS[idx].APP_ID, 
          'X-AVOSCloud-Application-Key': prj.LC_CONFS[idx].APP_KEY, 
          'Content-Type': 'application/json',
        }                
      };

      // iOS or Android
      let data;
      if(prj.LC_CONFS[idx].TYPE.match(/^iOS/i)) { // iOS
        data = new Buffer(JSON.stringify({
          where: {
            deviceToken: pushObjs[i].id,
          },
          prod: (prj.LC_CONFS[idx].TYPE.match(/^iOS-dev/i)) ? 'dev' : null,
          data: {
            alert: await(langStr(PUSH, pushObjs[i].lang, almObj)),
            sound: 'default',
          }
        }));
      } else { // Web, Android
        data = new Buffer(JSON.stringify({
          where: {
            installationId: pushObjs[i].id,
          },
          data: {
            action: "tw.com.ksmt.cloud.action.PUSH_RECEIVER",
            message: await(langStr(PUSH, pushObjs[i].lang, almObj)),
          }
        }));
      }
      pushReq(httpHdr, data, 0, false, (err, result) => {
        if(err){
          info(__file + ':' + __line + ' ' + err + ' (To ' + pushObjs[i].account + ' )');
          return next(null, pushObjs[i].account);
        }
        return next(null, null);
      });
    }), (err, results) => {
      results = results.filter(Boolean); // filter successful users
      if(results.length === 0) {
        almObj.status = ALMSTAT.PUSH_OK;
      } else {
        almObj.status = (pushObjs.length === results.length) ? ALMSTAT.PUSH_FAIL : ALMSTAT.PUSH_PART_FAIL;
        almObj.extra = almObj.extra ? almObj.extra : {};
        almObj.extra.err_recv = results;
      }
      logAlarm(almObj);
    });
  } catch(e) {
    info('CompanyId: ' + almObj.companyId + ', Account: ' + almObj.account + '\n' + e.stack);
    almObj.status = ALMSTAT.PUSH_FAIL;
    logAlarm(almObj);
  } finally {
    return callback();
  }
};
module.exports.lcPush = lcPush;

const email = (almObj, callback) => {
  let receivers = almObj.receivers;
  if(!Array.isArray(receivers)) {
    receivers = [receivers];
  }

  if(receivers.length === 0) {
    almObj.status = ALMSTAT.EMAIL_NO_RECV;
    logAlarm(almObj);
    return callback(gstate.NO_RECORD);
  }

  almObj.message = (almObj.message) ? ((almObj.message.length > 1024) ? almObj.message.substr(0, 1024) : almObj.message) : '' ;
  let status = ALMSTAT.EMAIL_OK; // email ok
  let [user, pass, host, port] = await([
    csid.get('C','SMTP_USER'),
    csid.get('C','SMTP_PSWD'),
    csid.get('C','SMTP_HOST'),
    csid.get('C','SMTP_PORT'),
  ]);
  let transporter = {
    host: host,
    port: port,
    secureConnection: false,
    connectionTimeout: prj.SMTP_CONN_TIMEOUT,
    // debug: true,
    // logger: true,
  };
  if(user && pass) {
    transporter.auth = {
      user: user,
      pass: pass,
    };
  }
  transporter = nodemailer.createTransport(transporter);
  asyncUtils.times(receivers.length, async((i, next) => {
    let mailOptions = {from: 'Cloud Message <' + ((user) ? user.split('@')[0] : 'noreply') + '@' + host + '>'}; // sender address
    let receiver = receivers[i];
    // send mail with defined transport object
    almObj.lang = receiver.lang;
    mailOptions.to = receiver.account;

    if(almObj.msgCode === ALMCODE.USER_DEFINED       ||
       almObj.msgCode === ALMCODE.BACK_NORMAL_ALARM  ||
       almObj.msgCode === ALMCODE.UPPER_LIMIT_ALARM  ||
       almObj.msgCode === ALMCODE.LOWER_LIMIT_ALARM)
    {
      let addrStr = '';
      let addr = (almObj.extra.addr) ? almObj.extra.addr : ((almObj.addr) ? almObj.addr : '');
      let [haddr, laddr] = addr.toString().split('-');
      if(almObj.slvIdx > 0) {
        if(haddr && laddr) {
          addrStr = ('FC-' + utils.getFCode(haddr) + ', 0x' + utils.getMbusAddr(haddr) + '-' + '0x' + utils.getMbusAddr(laddr)) + ' (' + haddr + '-' + laddr + ')';
        } else {
          addrStr = ('FC-' + utils.getFCode(haddr) + ', 0x' + utils.getMbusAddr(haddr)) + ' (' + haddr + ')';
        }
      } else {
        addrStr = (haddr && laddr) ? (haddr + '-' + laddr) : haddr ;
      }

      let srcDev = await(langStrSrcDev(receiver.lang, almObj));
      mailOptions.subject = LANG[receiver.lang].subject  + ' (' + LANG[receiver.lang].company + ': ' + almObj.company + ', ' + LANG[receiver.lang].device + ': ' + srcDev + ')';
      mailOptions.html    = '<br/><table style=\'width:400px\'>';
      mailOptions.html   += '<tr><td><strong>' + LANG[receiver.lang].company       + '</strong></td><td>' + almObj.company           + '</td><tr>';
      mailOptions.html   += '<tr><td><strong>' + LANG[receiver.lang].device        + '</strong></td><td>' + srcDev                   + '</td><tr>';
      mailOptions.html   += '<tr><td><strong>' + LANG[receiver.lang].mac_addr      + '</strong></td><td>' + utils.hex2mac(almObj.sn) + '</td><tr>';   
      mailOptions.html   += '<tr><td><strong>' + LANG[receiver.lang].register      + '</strong></td><td>' + addrStr                  + '</td><tr>';                                  
      mailOptions.html   += '<tr><td><strong>' + LANG[receiver.lang].alarm_content + '</strong></td><td>' + await(langStr(EMAIL, receiver.lang, almObj)) + '</td><tr>';
      mailOptions.html   += getRRmsg(receiver.lang, almObj);
      mailOptions.html   += '</table>' + LANG[receiver.lang].noreply;
    } else if(almObj.msgCode === ALMCODE.RESET_PSWD) {
      mailOptions.subject = LANG[receiver.lang].request_tmp_password;
      mailOptions.html    = await(langStr(EMAIL, receiver.lang, almObj)) + LANG[receiver.lang].noreply;
    } else { // other cases
      mailOptions.subject = almObj.subject;
      mailOptions.html    = await(langStr(EMAIL, receiver.lang, almObj)) + LANG[receiver.lang].noreply;
    }
    transporter.sendMail(mailOptions, (error, result) => {
      if(error){
        info({__file, __line, err: error + ' (For ' + receiver.account + ' )'});
        return next(null, receiver.account);
      }
      return next(null, null);

    });
  }), (err, result) => {
    result = result.filter(Boolean); // filter successful users
    if(result.length === 0) {
      almObj.status = ALMSTAT.EMAIL_OK;
    } else {
      almObj.status = (result.length === receivers.length) ? ALMSTAT.EMAIL_FAIL : ALMSTAT.EMAIL_PART_FAIL ;
      almObj.extra = almObj.extra ? almObj.extra : {};
      almObj.extra.err_recv = result;
    }
    if(almObj.msgCode === ALMCODE.RESET_PSWD) {
      almObj.message = LANG.en_US.request_tmp_password;
      logAlarm(almObj);
    } else if(almObj.type === 1) { // only Email alarm -> then logging
      logAlarm(almObj);
    }
    return callback(err, result);
  });
};
module.exports.email = email;

const isPassParent = (msgCode) => {
  if(msgCode === ALMCODE.NEW_ANNOUNCE || 
     msgCode === ALMCODE.RESET_PSWD) {
    return false;
  } 
  return true;
};

const getDbsIdx = (companyId) => {
  let qStr, querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    qStr = 'SELECT ' + i + ' AS `dbsIdx` FROM `' + db.TB_COMPANY + '` WHERE `' + db.TB_COMPANY + '`.`id` = ' + companyId + ' LIMIT 1;';
    querys.push(db.pr_query(i, qStr));
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    if(!results[i] || results[i].err || results[i].data.length === 0) {
      continue;
    }
    return results[i].data[0].dbsIdx;
  }
  return -1;
};

const getCompInfo = (almObj) => {
  let dbsIdx = almObj.dbsIdx;
  let companyId = almObj.companyId;
  let qStr = 'SELECT `company`,`numAlarm`,`parentId` FROM `' + db.TB_COMPANY + '` WHERE `id` = ' + companyId + ' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err || result.data.length === 0) {
    return result;
  }
  let curAlarm = parseInt(result.data[0].numAlarm);
  let maxAlarm = await(csid.get('C','MAX_ALARM_PER_DAY','int'));
  let availAlarm = maxAlarm - curAlarm;
  let company = result.data[0].company;
  let parentId = result.data[0].parentId;
  return {parentId, company, availAlarm, curAlarm};
};

const wrAlarmCnt = (almObj, numAlarm) => {
  let companyId = almObj.companyId;
  let dbsIdx = almObj.dbsIdx;
  let qStr = 'UPDATE `' + db.TB_COMPANY + '` SET `numAlarm` = `numAlarm` + ' + numAlarm + ' WHERE `id` = ' + companyId + ';';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    dbg({__file, __line, err: result.err});
  }
  return result;
};

const getReceivers = (type, almObj, devConf) => {
  let receivers = [];
  if(type === 'AlarmUser') {
    let qStr = 'SELECT `' + db.TB_USER + '`.`id`,`' + db.TB_USER + '`.`account`, `' + db.TB_USER + '`.`pushType`, `' + db.TB_USER + '`.`lang`, `' + db.TB_USER + '`.`gcmId` FROM `' + db.TB_USER + '`' +
               'LEFT JOIN `' + db.TB_DEVICE_AUTH + '`  ON  `' +
                db.TB_DEVICE_AUTH + '`.`memberId` = `' + db.TB_USER + '`.`id` AND `' +
                db.TB_DEVICE_AUTH + '`.`deviceId` = '  + devConf.id + ' ' +
               'WHERE `' + db.TB_USER + '`.`companyId` = ' + almObj.companyId + ' AND (`' + db.TB_USER + '`.`admin` > 0 OR `' + db.TB_DEVICE_AUTH + '`.`enAlarm` = 1) ' +
               'LIMIT 0, 100; ';

    let result = await(db.pr_query(almObj.dbsIdx, qStr));
    if (result.err) {
      almObj.err = result.err;
      return almObj;
    }
    receivers = result.data;
  } else if(type === 'AllUser') {
    let qStr = 'SELECT `' + db.TB_USER + '`.`id`,`' + db.TB_USER + '`.`account`, `' + db.TB_USER + '`.`pushType`, `' + db.TB_USER + '`.`lang`, `' + db.TB_USER + '`.`gcmId` FROM `' + db.TB_USER + '`' +
               'WHERE `'  + db.TB_USER + '`.`companyId` = ' + almObj.companyId + ' LIMIT 0, 100; ';

    let result = await(db.pr_query(almObj.dbsIdx, qStr));
    if (result.err) {
      almObj.err = result.err;
      return almObj;
    }
    receivers = result.data;
  } else if(type === 'Parent') {
    let qStr = 'SELECT `' + db.TB_USER + '`.`id`,`' + db.TB_USER + '`.`account`, `' + db.TB_USER + '`.`pushType`, `' + db.TB_USER + '`.`lang`, `' + db.TB_USER + '`.`gcmId` FROM `' + db.TB_USER + '`' +
               'WHERE `'  + db.TB_USER + '`.`companyId` = ' + almObj.companyId + ' AND `' + db.TB_USER + '`.`admin` > 0 LIMIT 0, 100;';

    let querys = [];
    for(let i = 0; i < prj.DBS.length; i++) {
      querys.push(db.pr_query(i, qStr));
    }
    let results = await(querys);
    for(let i = 0; i < results.length; i++) {
      if(!results[i] || results[i].err || results[i].data.length === 0) {
        continue;
      }
      receivers = receivers.concat(results[i].data);
    }
  } else {
    almObj.err = 'Unknow alarm type ' + type;
    return almObj;
  }

  almObj.receivers = [];
  almObj.pushObjs = [];
  for (let i = 0; i < receivers.length; i++) {
    if(type !== 'Parent') {
      if(almObj.limitId && almObj.limitId.indexOf(receivers[i].id) >= 0) {
        continue; // Found in Limited list. No Permission
      }
    }
    if(receivers[i].account) {
      almObj.receivers.push({
        account: receivers[i].account,
        lang: receivers[i].lang ? receivers[i].lang : 'en_US'
      });
    }
    if(receivers[i].gcmId && receivers[i].gcmId !== '') {
      almObj.pushObjs.push({
        account: receivers[i].account,
        type: receivers[i].pushType,
        id: receivers[i].gcmId,
        lang: receivers[i].lang ? receivers[i].lang : 'en_US'
      });
    }
  }
  return almObj;
};

const fireAlarm = (almObj, curAlarm) => {
  return new Promise((resolve, reject) => {
    if(almObj.type === 0) { // Alarm
      lcPush(almObj, async((err, result) => {
        if(typeof curAlarm !== 'undefined') {
          await(wrAlarmCnt(almObj, 1));
        }                
        if(err) { 
          dbg({__file, __line, err}); 
          return resolve({err});
        } 
        return resolve();
      }));
    } else if(almObj.type === 1) {  // Email
      email(almObj, async((err, result) => {
        if(typeof curAlarm !== 'undefined') {
          await(wrAlarmCnt(almObj, 1));
        }                
        if(err) { 
          dbg({__file, __line, err}); 
          return resolve({err});
        } 
        return resolve();
      }));
    } else if(almObj.type === 2) { // Alarm and Email
      email(almObj, async((err, result) => {
        if(typeof curAlarm !== 'undefined') {
          await(wrAlarmCnt(almObj, 1));
        }                
        if(err) { 
          dbg({__file, __line, err}); 
        } 
        lcPush(almObj, async((err, result) => {
          if(typeof curAlarm !== 'undefined') {
            await(wrAlarmCnt(almObj, 1));
          }                
          if(err) { 
            dbg({__file, __line, err}); 
            return resolve({err});
          } 
          return resolve();
        }));
      }));
    }
  });
};

const sendAlarmLimit = (almObj) => {
  return new Promise((resolve, reject) => {
    lcPush({
      dbsIdx: almObj.dbsIdx,
      time: parseInt(Date.now()/1000),
      companyId: almObj.companyId,
      account: almObj.account,
      type: 0, // only push message
      subject: almObj.subject,
      msgCode: (almObj.availAlarm === 1) ? ALMCODE.NO_AVAIL_ALARM : ALMCODE.FEW_ALARM,
      limitId: null,
      extra: null,
      pushObjs: almObj.pushObjs
    }, (err, result) => {
      return resolve({err, data: result});
    });
  });
};

const send = (almObj) => {
  almObj.time = parseInt(Date.now()/1000);

  // Set default subject
  if(!almObj.subject) {
    almObj.subject = 'Cloud Alarm';
  }

  let dbsIdx = almObj.dbsIdx;
  let devConf = await(device.get(dbsIdx, almObj.sn));
  if(almObj.companyId < 0) {
    almObj.companyId = devConf.companyId;
  }

  if(!devConf.id) {
    almObj.status = ALMSTAT.NO_DEV;
    await(logAlarm(almObj));
    return {err: gstate.NO_DEV};
  }

  if(devConf.enAlarm !== 1) {
    almObj.account = (almObj.account) ? almObj.account : devConf.name ;
    almObj.status = ALMSTAT.DEV_DISABLED;
    await(logAlarm(almObj));
    return {err: gstate.ALM_DISABLED};
  }

  // from device register
  let ctrlData;
  if(almObj.addr && almObj.sn) {
    ctrlData = await(ctrlblk.get(dbsIdx, almObj.sn));
    if(ctrlData) {
      ctrlData = ctrlData[almObj.addr];
    }
  }

  // Set default addr
  if(almObj.addr && ctrlData) {
    almObj.extra.addr = iotype.is16bit(ctrlData.type) ? almObj.addr : (almObj.addr + '-' + ctrlData.laddr);
  }

  // Set default limitId
  if(!almObj.limitId && ctrlData && ctrlData.limitId) {
    almObj.limitId = ctrlData.limitId;
  }

  // Default account : device name or slave device name
  if(!almObj.account) {
    almObj.account = devConf.name;
    if(model.isMbusMaster(devConf.mo) && almObj.addr && devConf.slvDev) {
      let sid = utils.getSlvId(almObj.addr);
      if(devConf.slvDev[sid]) {
        almObj.account +=  ' -> ' + devConf.slvDev[sid];
        almObj.slvIdx = sid;
      }
    }
  }

  // State register: don't show any value and unit
  if(ctrlData && ctrlData.type === iotype.MODBUS_SWITCH) {
    if(typeof almObj.extra.value !== 'undefined') {
      delete almObj.extra.value;
    }
    if(typeof almObj.extra.unit !== 'undefined') {
      delete almObj.extra.unit;
    }
    if(typeof almObj.extra.conf !== 'undefined') {
      delete almObj.extra.conf;
    }
  }

  let compInfo = await(getCompInfo(almObj));
  if(compInfo.err) {
    return compInfo;
  }

  almObj.company = compInfo.company;
  let curAlarm = compInfo.curAlarm;
  let availAlarm = compInfo.availAlarm;
  if(availAlarm < 1) {
    return {err: 'Reach the max limit of a day! ' + curAlarm};
  }

  // Send alarm to this company
  let newAlmObj = utils.clone(almObj);
  await(getReceivers('AlarmUser', newAlmObj, devConf));
  if(newAlmObj.err) {
    newAlmObj.status = ALMSTAT.DB_FAIL;
    await(logAlarm(newAlmObj));
    return newAlmObj;
  } else if(availAlarm < 7) { // Have to check limit here
    newAlmObj.availAlarm = availAlarm;
    sendAlarmLimit(newAlmObj);
  }
  fireAlarm(newAlmObj, curAlarm);

  // Pass alarm to parent company
  if(compInfo.parentId > 0 && isPassParent(almObj.msgCode)) {
    let parAlmObj = utils.clone(almObj);
    parAlmObj.extra = parAlmObj.extra ? parAlmObj.extra : {}; 
    parAlmObj.extra.company = compInfo.company;
    parAlmObj.companyId = compInfo.parentId;
    parAlmObj.dbsIdxChild = dbsIdx;
    parAlmObj.dbsIdx = await(getDbsIdx(parAlmObj.companyId));
    await(getReceivers('Parent', parAlmObj, devConf));
    if(parAlmObj.err) {
      parAlmObj.status = ALMSTAT.DB_FAIL;
      await(logAlarm(parAlmObj));
      return parAlmObj;
    }
    fireAlarm(parAlmObj);
  }
  return {status: gstate.OK};
};
module.exports.send = send;

// Call by new announce
const sendAll = (almObj) => {
  almObj.time = parseInt(Date.now() / 1000);

  // Set default subject
  if(!almObj.subject) {
    almObj.subject = LANG.en_US.subject;
  }

  let compInfo = await(getCompInfo(almObj));
  if(compInfo.err) {
    return compInfo;
  } else {
    almObj.company = compInfo.company;
  }

  let curAlarm = compInfo.curAlarm;
  let availAlarm = compInfo.availAlarm;
  if(availAlarm < 1) {
    return {err: 'Reach the max limit of a day! ' + curAlarm};
  }

  let newAlmObj = await(getReceivers('AllUser', almObj));
  if(newAlmObj.err) {
    newAlmObj.status = ALMSTAT.DB_FAIL;
    return newAlmObj;
  } 
  if(availAlarm < 7) { // Have to check limit here
    newAlmObj.availAlarm = availAlarm;
    sendAlarmLimit(newAlmObj);
  }        
  fireAlarm(newAlmObj, curAlarm);
  return {status: gstate.OK};
};
module.exports.sendAll = sendAll;

