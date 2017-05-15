const express = require('express');
const router = express.Router();
const prj = require('../project');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const gstate = require(prj.GSTATE_PATH);
const LANG = require(prj.LIB_PATH + '/lang');
const db = require(prj.DB_PATH);
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;
const csid = require(prj.LIB_PATH + '/csid');
const iosw = require(prj.LIB_PATH + '/iosw');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const device = require(prj.LIB_PATH + '/device');
const mbval = require(prj.LIB_PATH + '/mbval');
const utils = require(prj.LIB_PATH + '/utils');
const alarm = require(prj.LIB_PATH + '/alarm');
const md5 = require(prj.LIB_PATH + '/pswd').md5;
const regular = require(prj.LIB_PATH + '/regular');
const cronjob = require(prj.LIB_PATH + '/cronjob');
const PRODUCT_NAME = csid.mget('C', 'PRODUCT_NAME');
const nconf = require('nconf');
nconf.use('memory');

const getCompanyInfo = (company) => {
  let querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, 'SELECT `id` FROM `' + db.TB_COMPANY + '` WHERE BINARY `company` = \'' + company + '\' LIMIT 1;');
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let compInfo = results[i];
    if (compInfo.err || compInfo.data.length === 0) {
      compInfo = null;
    } else { // Found
      return {
        dbsIdx: i,
        companyId: compInfo.data[0].id
      };
    }
  }
  return {err: gstate.RC_NOT_FOUND};
};

router.get('/api/odm', (req, res) => {
  return res.status(gstate.RC_OK).send({odm: prj.CUSTOMER});
});

router.post('/api/password/reset', (req, res) => {
  let company = db.escape(req.body.company);
  let account = db.escape(req.body.account);
  dbg('Account reset company:' + company + ', account:' + account);
  if (!company || !account) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  } 

  // check company existed or not
  let compInfo = await(getCompanyInfo(company));
  if(compInfo.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_COMP});
  }

  // check user existed or not
  let companyId = compInfo.companyId;
  let dbsIdx = compInfo.dbsIdx;
  let qStr = 'SELECT `id`,`admin`,`lang` FROM `' + db.TB_USER + '` WHERE `account` = \'' + account + '\' AND `companyId` = ' + companyId + ' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr)); 
  if (result.err || result.data.length === 0) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_USER});
  }

  let userId = result.data[0].id;
  let lang   = result.data[0].lang ? result.data[0].lang : 'en_US';
  let admin  = parseInt(result.data[0].admin);
  if(admin === 0) { // only admin have the permission
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  
  // set backup password
  let bakpass = utils.randPass(8);
  qStr = 'UPDATE `' + db.TB_USER + '` SET `bakpass` =  \'' + md5(bakpass + account) + '\' WHERE `id` = \'' + userId + '\';';
  result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  // send the email with backup password
  alarm.email({
    dbsIdx: dbsIdx,
    companyId: companyId,
    time: parseInt(Date.now()/1000),
    account: account,
    receivers: {
      account: account,
      lang: lang,
    },
    subject: LANG[lang].request_pswd,
    msgCode: alarm.ALMCODE.RESET_PSWD,
    message: LANG[lang].request_pswd_msg + bakpass + '</b><br>',
    extra: null
  }, (err, result) => {
    if(err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: err});
    } else {
      return res.status(gstate.RC_OK).send({desc: gstate.OK});
    }   
  });
});

router.get('/api/cloud/status', (req, res) => {
  let dbOpts = {
    host: prj.NODE_ADMIN_ADDR,
    port: prj.ADMIN_DB_PORT,
    user: prj.ADMIN_DB_USER,
    password: prj.ADMIN_DB_PSWD,
    multipleStatements: true,
  };

  let qStr = 'SELECT `time`,`error`,`status` FROM  `kcloud_admin`.`services` ORDER BY `time` DESC LIMIT 1;';
     qStr += 'SELECT `time`,`status` FROM  `kcloud_admin`.`incidents` ORDER BY `time` DESC LIMIT 40;';

  let result = await(db.squery(dbOpts, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  let ret = {
    time: '',
    servStatus: {
      cloud: 1,
      mail: 1,
      push: 1,
      appDownload: 1,
      connection: 1,
    }, recentErrors: [],
  };
  let status;
  let serviceRow = result.data[0][0];
  let recentRow = result.data[1];
  if(serviceRow) {
    status = utils.toJson(serviceRow.status, {__file, __line});
    if(!status) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: gstate.ERROR});
    }
    ret.time = serviceRow.time;

    // Network quality
    if(status.net_quality.hinet_loss_rate > 15   ||
       status.net_quality.hinet_resp_ms > 300    ||
       status.net_quality.seednet_loss_rate > 15 ||
       status.net_quality.seedbet_resp_ms > 300) {
      ret.servStatus.connection = 0;
    }

    // Web
    let cloudSite = '';
    if(prj.CUSTOMER === 'HYEC') {
      cloudSite = 'hyec-cloud.ksmt.co';
    } else if(prj.CUSTOMER === 'YATEC') {
      cloudSite = 'yatec-cloud.ksmt.co';
    } else { // KCloud
      cloudSite = 'cloud.ksmt.co';
    }
    if(status.web[cloudSite] === 0) {
      ret.servStatus.cloud = 0;
    } else if(status.linode.singapore === 9 || status.linode.singapore === 0 || status.web[cloudSite] === 9) {
      ret.servStatus.cloud = 9;
    } else {
      ret.servStatus.cloud = 1;
    }

    // Mail (KSMT Jenkins)
    ret.servStatus.mail = status.mail;

    // Leancloud
    ret.servStatus.push = status.leancloud.push;

    // APP download
    ret.servStatus.appDownload = 1;
    if(status.bitbucket.source_downloads === 0 || status.bitbucket.website === 0) {
      ret.servStatus.appDownload = 0;
    } else if(status.bitbucket.source_downloads === 9 || status.bitbucket.website === 9) {
      ret.servStatus.appDownload = 9;
    }
  }
  let curHost = req.headers.host;
  for(let i = 0; i < recentRow.length; i++) {
    if(!recentRow[i]) {
      continue;
    }
    let incidents = utils.toJson(recentRow[i].status, {__file, __line});
    if(!incidents) {
      continue;
    }
    for(let j = 0; j < incidents.length ; j++) {
      if(incidents[j].msg.match(/bitbucket (api|source_download)/i)) {
        continue;
      } else if(incidents[j].domain && incidents[j].domain !== curHost) {
        continue;
      }
      incidents[j].time = recentRow[i].time;
      ret.recentErrors.push(incidents[j]);
    }
  }
  return res.status(gstate.RC_OK).send(ret);
});

// For checking the website status
router.get('/api/db/status', (req, res) => {
  let querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, 'SELECT `VARIABLE_NAME`,`VARIABLE_VALUE` FROM `information_schema`.`GLOBAL_STATUS` where `VARIABLE_NAME` = \'WSREP_CLUSTER_SIZE\'');
  }
  let statResult = '';
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if(result.err) {
      statResult += (' ' + i);
    } else if(!prj.DB_SOCK) { // use db cluster
      let nClusters = parseInt(result.data[0].VARIABLE_VALUE);
      if(nClusters !== prj.DBS[i].POOLS.length) {
        statResult += (' ' + i);
      }
    }
  }
  if(statResult.length === 0) {
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  } else {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: gstate.DB_ERROR + ' (Site:' + statResult + ')'});
  }
});

router.get('/api/trials/:company', (req, res) => {
  let company = db.escape(req.params.company);
  if(!company || company.length > 33) {
     return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  // check company existed or not
  let compInfo = await(getCompanyInfo(company));
  if(compInfo.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_COMP});
  }

  // Get how many trial accounts
  let MAX_USER = await(csid.get('C','MAX_USER','int'));
  let companyId = compInfo.companyId;
  let dbsIdx = compInfo.dbsIdx;
  let accList = await(db.pr_query(dbsIdx, 'SELECT `account`,`password` FROM `' + db.TB_USER + '` WHERE `companyId` = \'' + companyId + '\' AND `trial` = 1 LIMIT ' + MAX_USER + ';'));
  if (accList.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? accList.err : gstate.DB_ERROR)});
  } else if(accList.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  } 

  // Get used trial account 
  let usedList = await(db.pr_query(0, 'SELECT `account`,`expires` FROM `' + db.TB_SESSION + '` WHERE `company` = \'' + company + '\' LIMIT ' + MAX_USER * 2 + ';'));
  if (usedList.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? usedList.err : gstate.DB_ERROR)});
  }

  let nowTime = parseInt(Date.now() / 1000);
  for(let i = 0; i < accList.data.length; i++) {
    let found = false;
    for(let j = 0; j < usedList.data.length; j++) {
      if(accList.data[i].account === usedList.data[j].account && usedList.data[j].expires >= nowTime) { // in used
        found = true;
        break;
      }          
    }
    if(!found) {
      return res.status(gstate.RC_OK).send({
        desc: gstate.OK, 
        account: accList.data[i].account,
        password: accList.data[i].password,
      });     
    }     
  }
  return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_AVAIL_ACCOUNT});
});

// check if regular is alive or not 
router.get('/api/regular/check', (req, res) => {
  let ret = cronjob.status();
  return res.status(gstate.RC_OK).send(ret);
});

// Only for Mocha testing
router.get('/api/regular/logByDate', (req, res) => {
  if (!req.session.user || !req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.query.time || !req.query.unit) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.ERR_DATA});
  }

  let unit = db.escape(req.query.unit);
  if(!(unit === 'raw' || unit === 'day' || unit === 'month' || unit === 'year')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.ERR_DATA});
  }

  let time = parseInt(db.escape(req.query.time)) * 1000; // epoch second
  let date = new Date();
  date.setTime(time);
  await(regular.logByDate(true, date, unit));
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

module.exports = router;
