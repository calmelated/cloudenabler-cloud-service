const express = require('express');
const util = require('util');
const fs = require('fs');
const formidable = require('formidable');
const router = express.Router();
const prj = require('../project');
const md5 = require(prj.LIB_PATH + '/pswd').md5;
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const utils = require(prj.LIB_PATH + '/utils');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const sessionStore = require(prj.LIB_PATH + '/session');
const csid = require(prj.LIB_PATH + '/csid');
const audit = require(prj.LIB_PATH + '/audit');
const async = require('asyncawait/async');
const await = require('asyncawait/await');

const logout = (req, res) => {
  if(!req.session || !req.session.user) {
    return res.status(gstate.RC_OK).send({desc: gstate.ALREADY_LOGOUT});
  }
  let pushId = db.escape(req.body.pushId);
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let account = req.session.user.account;
  if(pushId && companyId && account) { // remove push ID if have any.
    let qStr = 'UPDATE `' + db.TB_USER + '` SET `gcmId` =  \'\',`bakpass` = \'\' WHERE `companyId` = \'' + companyId + '\' AND `account` = \'' + account + '\';';
    let result = await(db.pr_wquery(dbsIdx, qStr)); // delete it => anywhere
    if (result.err) {
      info('[Error] Cannot remove Push ID  (CompanyId: ' + companyId + ", Account: " + account + ", Push: " + pushId);
    }
  }
  await(audit.log(req.session.user, audit.ADTCODE.USER_LOGOUT));
  req.session.destroy(() => {
    if (req.originalUrl === '/api/logout') {
      res.status(gstate.RC_OK).send({desc: gstate.OK});
    } else {
      res.redirect('/');
    }
  });
};

const chkStatusGET = (req, res) => {
  if(!req.session || !req.session.user) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.AUTH_FAIL});
  }
  let dbsIdx = req.session.user.dbsIdx;
  let result = await(sessionStore.contain(req.sessionID));
  if (result) {
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  } else {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.AUTH_FAIL});
  }
};

// Authenticate using our plain-object database of doom!
const authenticate = (company, account, password) => {
  let querys = [];
  let qStr = 'SELECT `id`,`parentId` FROM `' + db.TB_COMPANY + '` WHERE BINARY `company` = \'' + company + '\' LIMIT 1;';
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, qStr);
  }

  let compInfo;
  let compInfos = await(querys);
  for(let i = 0; i < compInfos.length; i++) {
    compInfo = compInfos[i];
    if (compInfo.err || compInfo.data.length === 0) {
      compInfo = null;
      continue;
    } else {
      compInfo = compInfo.data[0];
      compInfo.dbsIdx = i;
      break;
    }
  }
  if(!compInfo) {
    return {err: 'Error: ' + gstate.NO_COMP};
  }

  qStr = 'SELECT `id`,`companyId`,`account`,`name`,`password`,`bakpass`,`admin`,`activate`,`trial` FROM `' + db.TB_USER + '` WHERE `account` = \'' + account + '\' AND `companyId` = \'' + compInfo.id + '\' LIMIT 1;';
  let userInfo = await(db.pr_query(compInfo.dbsIdx, qStr));
  if (userInfo.err) {
    return {err: 'Error: ' + gstate.DB_ERROR};
  } else if (userInfo.data.length === 0) { // no such user
    return {err: 'Error: ' + gstate.NO_USER};
  }
  userInfo = userInfo.data[0];
  userInfo.parentId = compInfo.parentId;
  userInfo.dbsIdx = compInfo.dbsIdx;
  if (userInfo.password !== password) {
    if (userInfo.bakpass && userInfo.bakpass === password) {
      info('[Warn] Company: ' + company + ', Account: ' + account + ' login with temporary password! ');
    } else {
      return {err: 'Error: ' + gstate.AUTH_FAIL};
    }
  }
  return {data: userInfo};
};

const loginPOST = (req, res) => {
  let company = db.escape(req.body.company);
  let account = db.escape(req.body.account);
  let password = db.escape(req.body.password);
  let force = db.escape(req.body.force);
  let pushId = db.escape(req.body.pushId);
  let pushType = (req.body.pushType) ? db.escape(req.body.pushType) : '0';
  dbg('Login company:' + company + ', account:' + account + ', password:' + password + ', force:' + force + ', pushType: ' + pushType  + ', pushId:' + pushId);
  if (!company || !account || !password) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.AUTH_FAIL});
  } else if(company.length > 32 || account.length > 64 || password.length > 32) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.AUTH_FAIL});
  } else if(pushType !== '0' && !pushId) {
    if(account.match(/^apple\d{0,1}@test.com/i)) {
      info('Ignore pushId check! company:' + company + ', account:' + account + ', pushType: ' + pushType  + ', pushId:' + pushId);
    } else {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_PUSHID});
    }
  } else if (req.session.user) {
    let reqUser = req.session.user;
    if (reqUser.company === company && reqUser.account === account) {
      if(reqUser.admin === 1 || reqUser.activate === 1) {
        dbg(reqUser.company + '-' + reqUser.account + ' already login');
        return res.status(gstate.RC_OK).send({desc: gstate.ALREADY_LOGIN});
      }
    }
  }

  // Do authenication
  let auth = await(authenticate(company, account, password));
  let user = auth.data;
  if (auth.err || !user) {
    info('[Error] Login Failed! ' + auth.err.toString() + ' (Company:' + company + ', Account:' + account + ', Password:' + password + ')');
    return res.status(gstate.RC_BAD_REQUEST).send({
      desc: gstate.AUTH_FAIL,
      extraMsg: auth.err.toString()
    });
  }

  // Regenerate session when signing in to prevent fixation
  let dbsIdx = user.dbsIdx;
  let lastSid = await(sessionStore.hasLastSession(req.sessionID, company, account));
  if(lastSid.data) {
    if(force) { // Force login, clear last session
      await(sessionStore.clear(lastSid.data));
      info('The last session ' + lastSid.data + '(' + company + '-' + account + ') has been logout');
    } else { // Someone already login
      return res.status(gstate.RC_NO_AUTH).send({
        desc: gstate.DUP_LOGIN,
        force: true,
      });
    }
  }
  req.session.regenerate(async(() => {
    // Store the user's primary key in the session store to be retrieved,
    // or in this case the entire user object
    req.session.user = user;
    req.session.user.company = company;
    if (user.admin === 0 && user.activate === 0) {
      return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_ACTIVATE, activate: false});
    }

    // trial user can't receive alarm
    if(user.trial === 1) {
      pushId = '';
    }

    // admin or activated users
    let lang = 'en_US';
    if(typeof req.body.lang !== "undefined") {
      let _lang = db.escape(req.body.lang);
      if(_lang.match('^zh')) {
        lang = 'zh_TW';
      } else if(_lang.match('en')) {
        lang = 'en_US';
      }
    }

    let qStr = 'UPDATE `' + db.TB_USER + '` SET `lang` = \'' + lang + '\', `gcmId` =  \'' + pushId + '\', `pushType` = \'' + pushType + '\', `bakpass` = \'\' WHERE `companyId` = \'' + user.companyId + '\' AND `account` = \'' + account + '\';';
    let result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      info('[Error] Cannot save Push ID  (Company: ' + company + ", Account: " + account + ", Push: " + pushId);
    }
    req.session.user.superAdmin = (user.admin === 2) ? true : false;
    req.session.user.companyId = (req.session.user.superAdmin && req.body.companyId) ? db.escape(req.body.companyId) : req.session.user.companyId ;
    req.session.user.dbsIdx = (req.session.user.superAdmin && typeof req.body.dbsIdx !== 'undefined') ? db.escape(req.body.dbsIdx) : req.session.user.dbsIdx ;
    await(audit.log(req.session.user, audit.ADTCODE.USER_LOGIN));

    let ret = {
      desc: gstate.OK,
      companyId: user.companyId
    };
    if(user.parentId) { 
      ret.parentId = user.parentId; 
    }
    if(user.admin === 2) { 
      ret.admin = 2; 
    }
    return res.status(gstate.RC_OK).send(ret);
  }));
};

//
// Geust -> Create a new 'Parent' company
// User -> No auth
// SuperAdmin -> Creat any type of company
// Admin of Parent copmany-> Create a child company
// Admin of Child copmany-> Can not creat a company
//
const newCompanyPOST = (req, res) => {
  if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let agent = db.escape(fields.agent);
    let company = db.escape(fields.company);
    let account = db.escape(fields.account);
    let password = db.escape(fields.password);
    let parentId = (fields.parentId && req.session) ? ((req.session.user.superAdmin) ? db.escape(fields.parentId) : req.session.user.companyId) : 0;
    if (!account || !password || !company) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    } else if(company.length < 2 || company.length > 32) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    } else if(account.length > 64 || !utils.vaildEmail(account)) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_EMAIL});
    } else if(password.length > 32 || !utils.strongPassword(password)) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_PASSWORD});
    } else if(!utils.valStr(company)) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }

    // check if the company existed or not
    let querys = [];
    let qStr = 'SELECT `id` FROM `' + db.TB_COMPANY + '` WHERE `company` = \'' + company + '\' LIMIT 1;';
    for(let i = 0; i < prj.DBS.length; i++) {
      querys[i] = db.pr_query(i, qStr);
    }
    let results = await(querys);
    for(let i = 0; i < querys.length; i++) {
      let result = results[i]; 
      if (result.err) {
        return res.status(gstate.RC_INTERNAL_ERR).send({desc: gstate.DB_ERROR});
      } else if(result.data.length > 0) {
        return res.status(gstate.RC_INTERNAL_ERR).send({desc: gstate.DUP_COMP});
      }
    }

    // Make sure an unique ID
    let companyId = -1;
    for(let retry = 0; retry < 3; retry++) {
      companyId = Math.round(Math.random() * 899) + '' + Math.round(Math.random() * 999) + (Date.now() % 10000000000);
      
      let querys = [];
      let qStr = 'SELECT `id` FROM `' + db.TB_COMPANY + '` WHERE `id` = \'' + companyId + '\' LIMIT 1;';
      for(let i = 0; i < prj.DBS.length; i++) {
        querys[i] = db.pr_query(i, qStr);
      }
      let results = await(querys);
      for(let i = 0; i < querys.length; i++) {
        let result = results[i]; 
        if (result.err) {
          return res.status(gstate.RC_INTERNAL_ERR).send({desc: gstate.DB_ERROR});
        } else if(result.data.length > 0) {
          companyId = -1;
          break; // create another ID
        }
      }
      if(companyId > 0) { // find an unique ID
        break;
      }
    }
    if(companyId < 0) { // can't find an ID
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DB_ERROR});
    }

    // Find a suitable db site
    querys = [];
    let minNum = 0xffffffff;
    let dbsIdx = prj.DBS.length - 1;
    qStr  = 'SELECT `TABLE_NAME`,`TABLE_ROWS` FROM `INFORMATION_SCHEMA`.`TABLES` WHERE `TABLE_SCHEMA` = \'' + db.DB_MMC + '\' AND `TABLE_NAME` = \'' + db.TB_COMPANY + '\' ';
    qStr += 'UNION SELECT `TABLE_NAME`,`TABLE_ROWS` FROM `INFORMATION_SCHEMA`.`TABLES` WHERE `TABLE_SCHEMA` = \'' + db.DB_MMC + '\' AND `TABLE_NAME` = \'' + db.TB_DEVICE + '\';';
    for(let i = 0; i < prj.DBS.length; i++) {
      querys[i] = db.pr_query(i, qStr);
    }
    results = await(querys);
    for(let i = 0; i < querys.length; i++) {
      let result = results[i]; 
      if(result.err || result.data.length !== 2) {
        continue;
      }
      let numComps  = result.data[0].TABLE_ROWS ? parseInt(result.data[0].TABLE_ROWS) : 0 ;
      let numDevs   = result.data[1].TABLE_ROWS ? parseInt(result.data[1].TABLE_ROWS) : 0 ;
      let expectNum = numComps * 30 + numDevs;
      if (expectNum < minNum) {
        minNum = expectNum;
        dbsIdx = i;
      }
    }

    info('Create a new company at database site ' + dbsIdx);
    qStr = 'INSERT INTO `' + db.TB_COMPANY + '` (`id`, `parentId`, `createTime`, `company`, `agent`) VALUES (' + companyId + ', ' + parentId + ', UNIX_TIMESTAMP(now()),' + '\'' + company + '\',\'' + agent + '\');';
    let result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: result.err.toString()});
    }

    qStr = 'INSERT INTO `' + db.TB_USER    + '` (`createTime`, `companyId`, `account`, `name`, `password`, `admin`, `activate`) VALUES (UNIX_TIMESTAMP(now()), ' + companyId + ', \'' + account + '\',' + '\'Admin\',\'' + md5(password + account) + '\', 1, 1);';
    result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      let errStr = result.err.toString();
      if(errStr.indexOf('duplicate') > 0 || errStr.indexOf('er_dup_entry') > 0) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DUP_COMP});
      } else {
        return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
      }
    }
    return res.status(gstate.RC_OK).send({
      desc: gstate.OK,
      rd: '/login',
    });
  }));
};

const activationPOST = (req, res) => {
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let account = db.escape(req.body.account);
  let origPswd = db.escape(req.body.origPswd);
  let newPswd = db.escape(req.body.newPswd);
  if (!account || !newPswd || !origPswd || !companyId) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  } else if(account.length > 64 /*|| !utils.vaildEmail(account)*/) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_EMAIL});
  } else if(newPswd.length > 32 || !utils.strongPassword(newPswd)) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_PASSWORD});
  } else if(!req.session.user.admin && req.session.user.account !== account) {
    return res.status(gstate.RC_FORBINDEN).send({desc: gstate.NOT_ALLOW});
  }

  let qStr = 'SELECT `id`,`account` FROM `' + db.TB_USER + '` WHERE `account` = \'' + account + '\' AND `password` = \'' + origPswd + '\' AND `companyId` = \'' + companyId + '\';';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if (result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_USER});
  }

  let rowId = result.data[0].id;
  qStr = 'UPDATE `' + db.TB_USER + '` SET ' + '`password` = \'' +  md5(newPswd + account) + '\', `activate` = 1 WHERE `account` =  \'' + account + '\' and `password` = \'' + origPswd + '\' AND `companyId` = \'' + companyId + '\';';
  result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  //req.session.user.activate = 1;
  await(audit.log(req.session.user, audit.ADTCODE.USER_ACTIVATE));
  delete req.session.user; // force the use logout
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
};

/* GET s => */
router.get('/', (req, res) => {
  if (req.originalUrl === '/api/login/status') {
    return chkStatusGET(req, res);
  } else if (req.originalUrl === '/api/logout') {
    return logout(req, res);
  } else if (req.originalUrl === '/api/company/add') {
    return; // not implement
  } else if (req.originalUrl === '/api/user/activate') {
    return res.end(); // not implement
  } else {
    info('[Warn] unknown query => ' + req.originalUrl);
    return res.end();
  }
});

// POST functioins ..
router.post('/login', loginPOST);
router.post('/', (req, res) => {
  if (req.originalUrl === '/api/login') {
    return loginPOST(req, res);
  } else if (req.originalUrl === '/api/logout') {
    return logout(req, res);
  } else if (req.originalUrl === '/api/company/add') {
    return newCompanyPOST(req, res);
  } else if (req.originalUrl === '/api/user/activate') {
    return activationPOST(req, res);
  } else {
    info('[Warn] unknown query => ' + req.originalUrl);
    return res.end();
  }
});

module.exports = router;
