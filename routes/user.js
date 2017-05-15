const express = require('express');
const router = express.Router();
const util = require('util');
const fs = require('fs');
const formidable = require('formidable');
const prj = require('../project');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const md5 = require(prj.LIB_PATH + '/pswd').md5;
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const utils = require(prj.LIB_PATH + '/utils');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;
const hex2mac = require(prj.LIB_PATH + '/utils').hex2mac;
const csid = require(prj.LIB_PATH + '/csid');
const audit = require(prj.LIB_PATH + '/audit');
const PRODUCT_NAME = csid.mget('C','PRODUCT_NAME');

router.get('/', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let MAX_USER_QUERY = await(csid.get('C','MAX_USER_QUERY','int'));
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0 ;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_USER_QUERY) ? db.escape(req.query.num): MAX_USER_QUERY;
  let companyId = req.session.user.companyId;
  let dbsIdx = req.session.user.dbsIdx;

  let qStr = ''; 
  qStr += 'SELECT COUNT(`id`) AS `total` FROM `' + db.TB_USER + '` WHERE `companyId` = ' + companyId + ';' ;
  qStr += 'SELECT `id`,`account`,`name`,`admin`,`admCtrl`,`trial`,`activate`,`allowDown`,`allowUp`,`pushType`,`gcmId` FROM `' + db.TB_USER + '`' +
      ' WHERE `companyId` = ' + companyId + ' LIMIT ' + num + ' OFFSET ' + from + ';';

  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({decs: result.err});
  }
  let total = result.data[0].total;
  result.data.shift();
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    total: total,
    from: ((from) ? from : 0),
    users: result.data,
  });
});

router.get('/auth/:account', (req, res) => {
  let account = db.escape(req.params.account);
  let MAX_DEVICE_QUERY = await(csid.get('C','MAX_DEVICE_QUERY','int'));
  let companyId = req.session.user.companyId;
  let dbsIdx = req.session.user.dbsIdx;
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0 ;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_DEVICE_QUERY) ? db.escape(req.query.num): MAX_DEVICE_QUERY;

  let qStr = 'SET @userId = (SELECT `id` FROM `' + db.TB_USER + '` WHERE `account` = \'' + account + '\' AND `companyId` = \'' + companyId + '\' LIMIT 1); ' +
             ' SELECT * FROM ( SELECT `' + db.TB_DEVICE+ '`.`id` AS `deviceId`,'  +
             ' LOWER(HEX(`' + db.TB_DEVICE  + '`.`sn`)) AS `sn`,' +
             ' `' + db.TB_DEVICE      + '`.`name`,' +
             // ' COALESCE(`' + db.TB_DEVICE_AUTH      + '`.`memberId`, @userId) AS `memberId`,' +
             ' COALESCE(`' + db.TB_DEVICE_AUTH + '`.`enAlarm`  ,0) enAlarm,' +
             ' COALESCE(`' + db.TB_DEVICE_AUTH + '`.`enControl`,0) enControl,' +
             ' COALESCE(`' + db.TB_DEVICE_AUTH + '`.`enMonitor`,0) enMonitor' +
             ' FROM `' + db.TB_DEVICE + '` ' +
             ' LEFT JOIN `' +  db.TB_DEVICE_AUTH + '`' +
             '  ON  `' + db.TB_DEVICE_AUTH + '`.`deviceId`  = `' + db.TB_DEVICE + '`.`id`' +
             '  AND `' + db.TB_DEVICE_AUTH + '`.`companyId` = `' + db.TB_DEVICE + '`.`companyId`' +
             '  AND `' + db.TB_DEVICE_AUTH + '`.`memberId`  = @userId' +
             ' WHERE `' + db.TB_DEVICE + '`.`companyId` = \'' + companyId + '\' AND @userId >= 0' +
             ' ORDER BY `' + db.TB_DEVICE + '`.`id` LIMIT ' + num + ' OFFSET ' + from  +
             ') AS `user_auth`;'; //' WHERE `user_auth`.`memberId` = @userId ;' ;

  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  
  // The first result
  result.data.shift();
  if (!result.data || result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD, rd: '/user/auth'});
  } else if(!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION, rd: '/user/auth'});
  }

  // return JSON
  for (let i = 0; i < result.data.length; i++) {
    result.data[i].sn = hex2mac(result.data[i].sn);
  }
  return res.status(gstate.RC_OK).send({desc: gstate.OK, devices: result.data});
});

router.get('/:account', (req, res) => {
  let account = db.escape(req.params.account);
  if(!req.session.user.admin && req.session.user.account !== account) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let qStr = 'SELECT `companyId`,`account`,`password`,`name`,`admin`,`admCtrl`,`trial`,`activate`,`allowDown`,`allowUp`,`pushType`,`gcmId`,`lang` FROM `' + db.TB_USER + '` WHERE `companyId` = ' + companyId + ' AND `account` = \'' + account + '\';';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if (!result.data || result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_USER});
  }
  return res.status(gstate.RC_OK).send({ 
    desc: gstate.OK,
    user: result.data[0],
  });
});

router.post('/add', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let MAX_USER = await(csid.get('C','MAX_USER','int'));
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let qStr = 'SELECT COUNT(`id`) AS `total` FROM `' + db.TB_USER + '` WHERE `companyId` = ' + companyId + ';' ;
  let result = await(db.pr_query(dbsIdx, qStr));
  if(result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(parseInt(result.data[0].total) >= MAX_USER) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.MAX_USER});
  }

  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let account = db.escape(fields.account);
    let password = db.escape(fields.password);
    if (!account || !password) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    } else if(account.length > 64 || !utils.vaildEmail(account)) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_EMAIL});
    } else if(password.length > 32 || !utils.strongPassword(password)) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_PASSWORD});
    }

    // if trial user -> admin = 0, activate = 1
    let trial = utils.isInputChecked(db.escape(fields.trial));
    let activate = (trial) ? 1 : utils.isInputChecked(db.escape(fields.activate));

    // super admin : all
    // root admin  : admin user, general user
    // admin       : general user
    let admin = utils.isInputChecked(db.escape(fields.admin));
    if(!trial && admin > 0) {
      if(req.session.user.superAdmin) {
        qStr += ',`admin` = \'' + utils.isInputChecked(db.escape(fields.admin)) + '\'';
      } else if(req.session.user.admin && req.session.user.name === 'Admin') { // root admin
        qStr += ',`admin` = \'' + utils.isInputChecked(db.escape(fields.admin)) + '\'';
      } else { // general admin
        return res.status(gstate.RC_FORBINDEN).send({desc: gstate.NOT_ALLOW});
      }
    }

    // Name = Admin has been reserved
    let userName = db.escape(fields.name).replace(/^\s+|\s+$/g, '');
    if(!req.session.user.superAdmin && userName === 'Admin') {
      return res.status(gstate.RC_FORBINDEN).send({desc: gstate.NO_ALLOW_NAME_ADMIN});
    } else if(userName.length < 1) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.STR_TOO_SHORT});
    } else if(userName.length > 32) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.STR_TOO_LONG});
    }

    //
    // Admin UI cnotrol
    // 0: TECO: 開發人緣
    // 1: TECO: 工程人員
    // 2: TECO: 管理者
    // 
    let admCtrl = db.escape(fields.admCtrl);
    admCtrl = (admCtrl) ? admCtrl : 0;

    let allowUp = utils.isInputChecked(db.escape(fields.allowUp));
    let allowDown = utils.isInputChecked(db.escape(fields.allowDown));
    qStr = 'INSERT INTO `' + db.TB_USER + '` (`createTime`,`companyId`,`account`,`name`,`password`,`admin`,`admCtrl`,`trial`,`activate`,`allowDown`,`allowUp`,`pushType`,`gcmId`) VALUES (UNIX_TIMESTAMP(now()),' +
      '\'' + companyId + '\',' +
      '\'' + account + '\',' +
      '\'' + userName + '\',' +
      '\'' + md5(password + account) + '\',' +
      '\'' + admin + '\',' +
      '\'' + admCtrl + '\',' +
      '\'' + trial + '\',' +
      '\'' + activate + '\',' +
      '\'' + allowDown + '\',' +
      '\'' + allowUp + '\',' +
      '\'' + db.escape(fields.pushType) + '\',' +
      '\'' + db.escape(fields.gcmId) + '\');';

    let result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.status === gstate.OK) {
      await(audit.log(req.session.user, audit.ADTCODE.NEW_USER, {'userName': userName}));
      return res.status(gstate.RC_OK).send({desc: gstate.OK});
    } else {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DUP_USER});
    }
  }));
});

router.put('/edit', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let account = db.escape(fields.account);
    if(!account || account.length > 64 /*|| !utils.vaildEmail(account)*/) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_EMAIL});
    }

    let dbsIdx = req.session.user.dbsIdx;
    let company = req.session.user.company;
    let companyId = req.session.user.companyId;
    let qStr = 'SELECT `id`,`account`,`name`,`password`,`activate`,`admin`,`admCtrl` FROM `' + db.TB_USER + '` WHERE `companyId` = ' + companyId + ' AND `account` = \'' + account + '\';';
    let result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else if(!result.data || result.data.length === 0) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_USER});
    }

    let activateSql = '';
    if(typeof fields.activate !== "undefined") {
      activateSql = ',`activate` = ' + utils.isInputChecked(db.escape(fields.activate));
    }
    if(typeof fields.password !== "undefined") {
      let newPswd = db.escape(fields.password);
      let origPswd = result.data[0].password;
      if (origPswd !== newPswd) { // password changed
        // dbg('origPswd: ' + origPswd + ', newPswd: ' + newPswd + ', activate: ' + activate);
        if(newPswd.length > 32 || !utils.strongPassword(newPswd)) {
          return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_PASSWORD});
        }
        activateSql = ',`activate` = 0, `password` = \'' + md5(newPswd + account) + '\'';
      }
    }

    qStr = 'UPDATE `' + db.TB_USER + '` SET `account` = \'' + account + '\'' + activateSql;
    qStr = (typeof fields.allowDown !== "undefined") ? (qStr + ',`allowDown` = \'' + utils.isInputChecked(db.escape(fields.allowDown)) + '\'') : qStr ;
    qStr = (typeof fields.allowUp !== "undefined") ? (qStr + ',`allowUp` = \'' + utils.isInputChecked(db.escape(fields.allowUp)) + '\'') : qStr ;
    qStr = (typeof fields.pushType !== "undefined") ? (qStr + ',`pushType` = \'' + db.escape(fields.pushType) + '\'') : qStr ;
    qStr = (typeof fields.admCtrl !== "undefined") ? (qStr + ',`admCtrl` = \'' + db.escape(fields.admCtrl) + '\'') : qStr ;
    qStr = (typeof fields.trial !== "undefined") ? (qStr + ',`trial` = \'' + utils.isInputChecked(db.escape(fields.trial)) + '\'') : qStr ;
    qStr = (typeof fields.gcmId !== "undefined") ? (qStr + ',`gcmId` = \'' + db.escape(fields.gcmId) + '\'') : qStr ;

    // language
    if(typeof fields.lang !== "undefined") {
      let _lang = db.escape(fields.lang);
      if(_lang.match('^zh')) {
        qStr = qStr + ',`lang` = \'zh_TW\'';
      } else if(_lang.match('en')) {
        qStr = qStr + ',`lang` = \'en_US\'';
      } else {
        qStr = qStr + ',`lang` = \'en_US\'';
      }
    }
    
    let userName = db.escape(fields.name);
    if(typeof fields.name !== "undefined") {
      if(result.data[0].name !== userName) { // username changed
        if(!userName || userName.length > 32) {
          return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
        } 
        // Admin cant rename itself, and other users cant rename to Admin
        if(userName === 'Admin' || result.data[0].name === 'Admin') { 
          return res.status(gstate.RC_FORBINDEN).send({desc: gstate.NO_ALLOW_NAME_ADMIN});                    
        }
        qStr += ',`name` = \'' + userName + '\'' ;
      }
    }

    // super admin : all
    // root admin  : admin user, general user
    // admin       : general user
    if(typeof fields.admin !== "undefined") {
      let admin = utils.isInputChecked(db.escape(fields.admin));
      if(admin !== result.data[0].admin) { // privlige changed
        if(req.session.user.superAdmin) { // delete everyone
          qStr += ',`admin` = \'' + admin + '\'';
        } else if(req.session.user.admin && req.session.user.name === 'Admin') { // root admin
          qStr += ',`admin` = \'' + admin + '\'';
        } else {
          return res.status(gstate.RC_FORBINDEN).send({desc: gstate.NOT_ALLOW});
        }
      }
    }
    qStr = qStr + ' WHERE `account` =  \'' + account + '\' AND `companyId` = \'' + companyId + '\';';

    // Update to database 
    result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }

    // make sure the user logout
    if(req.session.user.account !== account) { // not myself
      if(typeof fields.admin !== "undefined") {
        qStr = 'UPDATE `' + db.TB_SESSION + '` SET `session_id` = CONCAT(SUBSTR(MD5(RAND()) FROM 1 FOR 36), SUBSTR(UNIX_TIMESTAMP() from 5 for 10)), expires = 1470000000 WHERE `company` = \'' + company + '\' AND `account` = \'' + account + '\'; ';
        await(db.pr_wquery(0, qStr));
      }
    }

    if(fields.lang) {
      await(audit.log(req.session.user, audit.ADTCODE.CHG_LANG, {'lang': fields.lang}));
    } else {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_USER, {'userName': userName}));
    }
    return res.status(gstate.RC_OK).send({
      desc: gstate.OK,
      rd: '/user/edit/' + account,
      extraMsg: (account === req.session.user.account) ? gstate.CHG_SLEF : null,
    });
  }));
});

router.put('/lang', (req, res) => {
  if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let account = db.escape(fields.account);
    if(!account || account.length > 64 /*|| !utils.vaildEmail(account)*/) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_EMAIL});
    } else if(typeof fields.lang === "undefined") {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }

    let lang = db.escape(fields.lang);
    if(lang.match('^zh')) {
      lang = 'zh_TW';
    } else if(lang.match('en')) {
      lang = 'en_US';
    } else {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }

    let dbsIdx = req.session.user.dbsIdx;
    let companyId = req.session.user.companyId;
    let qStr = 'UPDATE `' + db.TB_USER + '` SET `lang` = \'' + lang + '\' WHERE `account` =  \'' + account + '\' AND `companyId` = \'' + companyId + '\';';
    let result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }

    await(audit.log(req.session.user, audit.ADTCODE.CHG_LANG, {'lang': fields.lang}));
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }));
});

router.put('/pushType', (req, res) => {
  if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let account = db.escape(fields.account);
    if(!account || account.length > 64 /*|| !utils.vaildEmail(account)*/) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_EMAIL});
    } else if(typeof fields.pushType === "undefined") {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }
    let pushType = db.escape(fields.pushType);
    let dbsIdx = req.session.user.dbsIdx;
    let companyId = req.session.user.companyId;
    let qStr = 'UPDATE `' + db.TB_USER + '` SET `pushType` = \'' + pushType + '\' WHERE `account` =  \'' + account + '\' AND `companyId` = \'' + companyId + '\';';
    let result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }));
});

router.put('/auth', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let account = db.escape(req.body.account);
  // if(account.length > 64 || !utils.vaildEmail(account)) {
  //     return res.status(gstate.RC_BAD_REQUEST).send({
  //         desc: gstate.INVALID_EMAIL,
  //     });
  // }

  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let qStr = 'SET @memberId = (SELECT `id` FROM `' + db.TB_USER + '` WHERE `account` = \'' + account + '\' AND `companyId` = \'' + companyId + '\' LIMIT 1); ';
  if(req.headers['content-type'] && req.headers['content-type'].indexOf('application/json') >= 0) {
    if(!req.body.devices) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.PARAMETER_ERROR});
    }
    req.body.devices.forEach((dev) => {
      let deviceId = db.escape(dev.deviceId);
      let enMonitor = db.escape(dev.enMonitor);
      let enControl = db.escape(dev.enControl);
      let enAlarm = db.escape(dev.enAlarm);
      qStr += 'INSERT INTO `' + db.TB_DEVICE_AUTH +
          '` (`companyId`,`deviceId`,`memberId`,`enMonitor`,`enControl`,`enAlarm`) VALUES (' +
             companyId + ',' + deviceId + ', @memberId,' + enMonitor + ',' + enControl + ',' + enAlarm +
          ') ON DUPLICATE KEY UPDATE `enMonitor` = ' + enMonitor + ', `enControl` = ' + enControl + ', `enAlarm`  =  ' + enAlarm + ';';
    });
  } else {
    let type = db.escape(req.body.type);
    let deviceId = db.escape(req.body.deviceId);
    let enable = utils.isInputChecked(db.escape(req.body.enable));
    qStr += 'INSERT INTO `' + db.TB_DEVICE_AUTH + '` (`companyId`,`deviceId`,`memberId`,`' + type + '`) VALUES (' + companyId + ',' + deviceId + ', @memberId,' + enable +
         ') ON DUPLICATE KEY UPDATE `' + type + '` = ' + enable + ';';
  }

  let result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  } else {
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }
});

router.delete('/:account', (req, res) => {
  let account = db.escape(req.params.account);
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(req.session.user.account === account) { // administrator kills itself
    return res.status(gstate.RC_FORBINDEN).send({desc: gstate.NOT_ALLOW});
  }
  // } else if(account.length > 64 || !utils.vaildEmail(account)) {
  //     return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_EMAIL});
  // }

  let dbsIdx = req.session.user.dbsIdx;
  let company = req.session.user.company;
  let companyId = req.session.user.companyId;
  let qStr = 'SELECT `id`,`name`,`admin` FROM `'  + db.TB_USER + '` WHERE `account` =  \'' + account + '\' AND `companyId` = \'' + companyId + '\'  LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(result.data.length === 0){
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_USER});
  }
  let userName = result.data[0].name;
  let admin = parseInt(result.data[0].admin);

  // super admin : delete all
  // root admin  : delete admin user, general user
  // admin       : delete general user
  if(req.session.user.superAdmin) { // delete everyone
    qStr = qStr; // nothing
  } else if(req.session.user.admin && req.session.user.name === 'Admin') { // root admin delete general admin and users
    if(userName === 'Admin' || admin > 1) {
      return res.status(gstate.RC_FORBINDEN).send({desc: gstate.NOT_ALLOW});
    }
  } else { // general admin -> delete general users
    if(admin > 0) {
      return res.status(gstate.RC_FORBINDEN).send({desc: gstate.NOT_ALLOW});
    }
  }

  // remove from database
  qStr  = 'DELETE FROM `' + db.TB_DEVICE_AUTH  + '` WHERE `memberId` = ' + result.data[0].id + ' AND `companyId` = \'' + companyId + '\';';
  qStr += 'DELETE FROM `' + db.TB_USER         + '` WHERE `id` = ' + result.data[0].id + ' AND `companyId` = \'' + companyId + '\'; ';
  result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});                
  }

  // force user to logout
  qStr = 'UPDATE `' + db.TB_SESSION + '` SET `session_id` = CONCAT(SUBSTR(MD5(RAND()) FROM 1 FOR 36), SUBSTR(UNIX_TIMESTAMP() from 5 for 10)), expires = 1470000000 WHERE `company` = \'' + company + '\' AND `account` = \'' + userName + '\'; ';
  result = await(db.pr_wquery(0, qStr));
  if (result.err) { dbg(result.err); }

  await(audit.log(req.session.user, audit.ADTCODE.DELETE_USER, {'userName': userName}));
  return res.status(gstate.RC_OK).send({desc: gstate.OK, rd: '/user'});
});

module.exports = router;
