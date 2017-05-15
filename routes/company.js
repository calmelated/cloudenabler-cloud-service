const express = require('express');
const router = express.Router();
const util = require('util');
const fs = require('fs');
const formidable = require('formidable');
const prj = require('../project');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const iosw = require(prj.LIB_PATH + '/iosw');
const csid = require(prj.LIB_PATH + '/csid');
const device = require(prj.LIB_PATH + '/device');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const utils = require(prj.LIB_PATH + '/utils');
const mbval = require(prj.LIB_PATH + '/mbval');
const complib = require(prj.LIB_PATH + '/company');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const PRODUCT_NAME = csid.mget('C','PRODUCT_NAME');

//
// Geust -> No auth
// User -> No auth
// SuperAdmin -> List all companies
// Admin of Parent company-> List itself and all its child companies
// Admin of Child company-> List itself only
//
router.get('/', (req, res) => {
  if (!req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let MAX_COMPANY_QUERY = await(csid.get('C','MAX_COMPANY_QUERY','int'));
  let querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = 'SELECT ' + i + ' AS `dbsIdx`,`id`,`parentId`,`company`,`agent` FROM `' + db.TB_COMPANY + '` LIMIT ' + MAX_COMPANY_QUERY + ' ;';
    querys[i] = db.pr_query(i, qStr);
  }
  let compList = [];
  let results = await(querys);
  for(let i = 0; i < prj.DBS.length; i++) {
    let result = results[i];
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else if(result.data.length === 0) {
      continue;
    }
    compList = compList.concat(result.data);
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    total: compList.length,
    from: 0,
    companies: compList,
  });
});

router.get('/sub', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }

  let companyId;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    companyId = db.escape(req.query.companyId);
  } else {
    companyId = req.session.user.companyId;
  }

  let MAX_COMPANY_QUERY = await(csid.get('C','MAX_COMPANY_QUERY','int'));
  let compList = [];
  let querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = 'SELECT ' + i + ' AS `dbsIdx`,`id`,`company`,`agent` FROM `' + db.TB_COMPANY + '` WHERE `parentId` = \'' + companyId + '\' LIMIT ' + MAX_COMPANY_QUERY + ';';
    querys[i] = db.pr_query(i, qStr);
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else if(result.data.length === 0) {
      continue;
    }
    compList = compList.concat(result.data);
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    total: compList.length,
    from: 0,
    companies: compList,
  });
});

//
// Geust -> No auth
// User -> Get info of itself by ID
// SuperAdmin -> Get info of all companies by ID
// Admin of Parent company-> Get info of itself and its child company by ID
// Admin of Child company-> Get info of itself by ID
//
router.get('/id/:id', (req, res) => {
  // Can only get their own settings except superadmin
  let curCompId = parseInt(req.session.user.companyId);
  let companyId = parseInt(db.escape(req.params.id));
  if(!(curCompId === companyId || req.session.user.superAdmin)) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }

  let compInfo = await(complib.getInfo(companyId));
  if(compInfo.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_COMP});
  }

  let dbsIdx = compInfo.data.dbsIdx;
  let qStr = 'SELECT `id`,`parentId`,`company`,`agent`,`numAlarm`,`extra` FROM `' + db.TB_COMPANY + '` WHERE `id` = \'' + companyId + '\' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }

  result.data[0].extra = utils.toJson(result.data[0].extra, {__file, __line, companyId});
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    company: result.data[0],
  });
});

// @ depressed
router.get('/:company', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }

  // Can only get their own settings except superadmin
  let curCompany = req.session.user.company;
  let company = db.escape(req.params.company);
  if(curCompany !== company && !req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }

  let compInfo = await(complib.getInfoByName(company));
  if(compInfo.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_COMP});
  }

  let dbsIdx = compInfo.data.dbsIdx;
  let qStr = 'SELECT `id`,`parentId`,`company`,`agent`,`numAlarm`,`extra` FROM `' + db.TB_COMPANY + '` WHERE `company` = \'' + company + '\' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }

  result.data[0].extra = utils.toJson(result.data[0].extra, {__file, __line, company});
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    company: result.data[0],
  });
});

//
// Geust -> No auth
// User -> No auth
// SuperAdmin -> login to any companies
// Admin of Parent company-> login to his child companies
// Admin of Child company-> CAN NOT login to other companies
//
router.put('/login/:companyId', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }

  // From which company (parent)
  let curCompId = parseInt(req.session.user.companyId);
  let fromId = (utils.has(req.query.fromId)) ? parseInt(db.escape(req.query.fromId)) : -1;
  if(fromId > 0) {
    if(req.session.user._companyId && fromId === req.session.user._companyId) {
      curCompId = fromId; // Wants to switch to another subcompany from a subcompany
    } else { // haven't login to any company
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
    }
  }

  // Target (child company)
  let childId = parseInt(db.escape(req.params.companyId));
  if(curCompId === childId) {
    return res.status(gstate.RC_OK).send({desc: gstate.ALREADY_LOGIN});
  }

  // Auth: superAdmin can go to any company
  let compInfo = null;
  if(req.session.user.superAdmin) {
    compInfo = await(complib.getInfo(childId));
  } else { // Auth: you can only sign in to your child companies.
    compInfo = await(complib.hasSubCompany(curCompId, childId));
  }
  if(!compInfo || compInfo.err) { // Not found any
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }

  if(utils.isNone(req.session.user._companyId)) { // keep the session of the parent company
    req.session.user._dbsIdx = req.session.user.dbsIdx;
    req.session.user._name = req.session.user.name;
    req.session.user._companyId = curCompId;
  }
  req.session.user.companyId = childId;
  req.session.user.dbsIdx = compInfo.data.dbsIdx;
  req.session.user.name = 'Admin';
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

router.put('/logout', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.session.user._companyId) { // Not in Subcompany
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }
  complib.logoutSubcomp(req.session.user);
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

//
// Geust -> No auth
// User -> No auth
// SuperAdmin -> Edit any companies
// Admin of Parent company -> Edit itself and its child companies
// Admin of Child company -> Edit itself only
//
router.put('/edit', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let companyId = parseInt(db.escape(fields.companyId));
    if(!companyId) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }

    // Can only change their own settings except superadmin
    let curCompId = parseInt(req.session.user.companyId);
    if(!(curCompId === companyId || req.session.user.superAdmin)) {
      return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
    }

    // Get which database site
    let compInfo = await(complib.getInfo(companyId));
    if(compInfo.err) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_COMP});
    }

    let dbsIdx = compInfo.data.dbsIdx;
    let qStr = 'SELECT `company`,`extra` FROM `' + db.TB_COMPANY + '` WHERE `id` = ' + companyId + ';';
    let result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send(result);
    } else if (!result.data || result.data.length === 0) { // no such record
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_COMP});
    }
    result.data[0].extra = utils.toJson(result.data[0].extra, {__file, __line, companyId}) ;
    result.data[0].extra = (result.data[0].extra) ? result.data[0].extra : {} ;
    result.data[0].extra.ct_email   = (typeof fields.ct_email   !== "undefined") ? db.escape(fields.ct_email)   : fields.ct_email;
    result.data[0].extra.ct_company = (typeof fields.ct_company !== "undefined") ? db.escape(fields.ct_company) : fields.ct_company;
    result.data[0].extra.ct_name    = (typeof fields.ct_name    !== "undefined") ? db.escape(fields.ct_name)    : fields.ct_name;
    result.data[0].extra.ct_phone   = (typeof fields.ct_phone   !== "undefined") ? db.escape(fields.ct_phone)   : fields.ct_phone;

    qStr = 'UPDATE `' + db.TB_COMPANY + '` SET ';
    qStr = qStr + '`extra` = \'' + utils.toJsonStr(result.data[0].extra, {__file, __line, companyId}) + '\'';
    qStr = (typeof fields.agent !== "undefined") ? qStr + ',`agent` = \'' + db.escape(fields.agent) + '\'' : qStr ;
    qStr = (typeof fields.parentId !== "undefined") ? qStr + ',`parentId` = \'' + db.escape(fields.parentId) + '\'' : qStr ;
    qStr = qStr + ' WHERE `id` =  \'' + companyId + '\';';

    result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }
    return res.status(gstate.RC_OK).send({
      desc: gstate.OK,
      rd: '/company/edit/' + companyId,
    });
  }));
});

//
// Geust -> No auth
// User -> No auth
// SuperAdmin -> Rename any companies
// Admin of Parent company -> Rename itself and its child companies
// Admin of Child company -> Rename itself only
//
router.put('/rename', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let companyId = parseInt(db.escape(fields.companyId));
    let newName = db.escape(fields.company);
    if(!companyId || utils.isNone(newName)) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }

    // Can only change their own settings except superadmin
    let curCompId = parseInt(req.session.user.companyId);
    if(!(curCompId === companyId || req.session.user.superAdmin)) {
      return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
    }

    // Only Admin and SperAdmin can change company name
    let userName = req.session.user.name;
    if(!(userName === 'Admin' || req.session.user.superAdmin)) {
      return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
    }

    // Get database idx
    let compInfo = await(complib.getInfo(companyId));
    if(compInfo.err) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_COMP});
    } 

    // make sure its uniqueness
    let oldName = compInfo.data.company;
    let dbsIdx = compInfo.data.dbsIdx;
    let newCompInfo = await(complib.getInfoByName(newName));
    if(!newCompInfo.err) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DUP_COMP});
    } 

    let qStr = 'UPDATE `' + db.TB_COMPANY + '` SET `company` = \'' + newName + '\' WHERE `id` =  \'' + companyId + '\';';
    let result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else {
      complib.logout(oldName);
    }
    return res.status(gstate.RC_OK).send({
      desc: gstate.OK,
      rd: '/company/edit/' + companyId,
    });
  }));
});

//
// Geust -> No auth
// User -> No auth
// SuperAdmin -> Delete any companies
// Admin of Parent company -> Delte itself and its child companies
// Admin of Child company -> Delete itself only
//
const removeCompany = (req, res, companyId) => {
  let querys = [];
  let compList = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = '';
    qStr += 'SELECT ' + i + ' AS `dbsIdx`,`id`,`company`,`parentId` FROM `' + db.TB_COMPANY + '` WHERE `id` = \'' + companyId + '\'';  // this company, parent company
    qStr += 'UNION SELECT ' + i + ' AS `dbsIdx`,`id`,`company`,`parentId` FROM `' + db.TB_COMPANY + '` WHERE `parentId` = \'' + companyId + '\';'; // sub-company
    querys[i] = db.pr_query(i, qStr);
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if(result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else if (result.data.length === 0) {
      continue;
    } else {
      compList = compList.concat(result.data);
    }
  }

  let error;
  let time = Date.now();
  for(let i = 0; i < compList.length; i++) {
    let qStr = '';
    let compInfo = compList[i];
    let devList = await(complib.getDevices(compInfo.dbsIdx, compInfo.id));
    if(!devList.err) { // has devices under this company
      for(let j = 0; j < devList.data.length; j++) {
        let devInfo = devList.data[j];
        qStr += 'DROP TABLE IF EXISTS `' + db.TB_EVTLOG + '_' + devInfo.sn + '`,`' + db.TB_MCACHE + '_' + devInfo.sn + '` ;';
        qStr += 'DROP DATABASE IF EXISTS `' + db.DB_RLOG + '_' + devInfo.sn + '` ;';
        qStr += 'DELETE FROM `' + db.TB_IOSW + '` WHERE `sn` = UNHEX(\'' + devInfo.sn + '\');';
        qStr += 'DELETE FROM `' + db.TB_IOSW + '` WHERE `swSN` = UNHEX(\'' + devInfo.sn + '\');';

        // remove alarm log from parent company
        if(compInfo.parentId > 0) {
          qStr += 'DELETE FROM `' + db.TB_ALARM_LOG  + '` WHERE `companyId` = ' + compInfo.parentId + ' AND `sn` = UNHEX(\'' + devInfo.sn + '\');';
        }
      }
    }
    qStr += 'DELETE FROM `' + db.TB_USER         + '` WHERE `companyId` = \'' + compInfo.id + '\';';
    qStr += 'DELETE FROM `' + db.TB_DEVICE_AUTH  + '` WHERE `deviceId`  IN (SELECT `id` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = \'' + compInfo.id + '\');';
    qStr += 'DELETE FROM `' + db.TB_DEVICE       + '` WHERE `companyId` = \'' + compInfo.id + '\';';
    qStr += 'DELETE FROM `' + db.TB_ALARM_LOG    + '` WHERE `companyId` = \'' + compInfo.id + '\';';
    qStr += 'DELETE FROM `' + db.TB_AUDIT_LOG    + '` WHERE `companyId` = \'' + compInfo.id + '\';';
    qStr += 'DELETE FROM `' + db.TB_IOSTAT_LOG   + '` WHERE `companyId` = \'' + compInfo.id + '\';';
    qStr += 'DELETE FROM `' + db.TB_FLINK        + '` WHERE `companyId` = \'' + compInfo.id + '\';';
    qStr += 'DELETE FROM `' + db.TB_ANNOUNCE_LIST+ '` WHERE `companyId` = \'' + compInfo.id + '\';';
    qStr += 'DELETE FROM `' + db.TB_GROUP        + '` WHERE `companyId` = \'' + compInfo.id + '\';';
    qStr += 'DELETE FROM `' + db.TB_ADVGP_HDR    + '` WHERE `companyId` = \'' + compInfo.id + '\';';
    qStr += 'DELETE FROM `' + db.TB_ADVGP_MBR    + '` WHERE `companyId` = \'' + compInfo.id + '\';';
    // qStr += 'DELETE FROM `' + db.TB_MCACHE       + '` WHERE `companyId` = \'' + compInfo.id + '\';';
    // qStr += 'UPDATE `'      + db.TB_MCACHE       + '` SET `time` = ' + time + ',`type` = 9, `value` = ' + time + ' WHERE `companyId` = \'' + compInfo.id + '\';';
    qStr += 'DELETE FROM `' + db.TB_COMPANY      + '` WHERE `id` = \'' + compInfo.id + '\';';

    // Remove subcompany one by one
    let result = await(db.pr_wquery(compInfo.dbsIdx, qStr));
    if (result.err) { // failed!
      dbg({__file, __line, err: result.err});
      error = result.err;
      continue;
    }

    // Success, then remove data in mcaches
    if(!devList.err) {
      for(let j = 0; j < devList.data.length; j++) {
        let devInfo = devList.data[j];
        device.delCache(devInfo.sn);
        ctrlblk.delCache(devInfo.sn);
        mbval.delCache(devInfo.sn);
      }
    }

    // Force user to logout
    complib.logout(compInfo.company);
  }
  if(error) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: error});
  } else {
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }
};

router.delete('/id/:companyId', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let userName = req.session.user.name;
  let dbsIdx = req.session.user.dbsIdx;
  let curCompId = parseInt(req.session.user.companyId);
  let companyId = parseInt(db.escape(req.params.companyId));
  if((curCompId === companyId && userName === 'Admin') || req.session.user.superAdmin) { // Kill myself
    await(removeCompany(req, res, companyId));
  } else { // Parent -> remove Child company
    let comp = await(complib.hasSubCompany(curCompId, companyId));
    if(comp.err) { // Don't found any child company
      return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
    }
    await(removeCompany(req, res, companyId));
  }
});

router.delete('/:company', (req, res) => {
  if (!req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let querys = [];
  let company = db.escape(req.params.company);
  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = 'SELECT `id` FROM `' + db.TB_COMPANY + '` WHERE `company` = \'' + company + '\' LIMIT 1;';
    querys[i] = db.pr_query(i, qStr);
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if (result.status === gstate.OK && result.data.length > 0) {
      return await(removeCompany(req, res, result.data[0].id));
    }
  }
  return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_COMP});
});

module.exports = router;
