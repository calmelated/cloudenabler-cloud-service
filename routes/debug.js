const express = require('express');
const router = express.Router();
const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const db = require(prj.DB_PATH);
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const utils = require(prj.LIB_PATH + '/utils');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;
const hex2mac = require(prj.LIB_PATH + '/utils').hex2mac;
const getRealAddr = require(prj.LIB_PATH + '/utils').getRealAddr;
const getSlvId = require(prj.LIB_PATH + '/utils').getSlvId;
const sessionStore = require(prj.LIB_PATH + '/session');
const csid = require(prj.LIB_PATH + '/csid');
const iosw = require(prj.LIB_PATH + '/iosw');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const device = require(prj.LIB_PATH + '/device');
const mbval = require(prj.LIB_PATH + '/mbval');
const iotype = require(prj.ROOT_PATH + '/public/js/iotype');
const model = require(prj.ROOT_PATH + '/public/js/model');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const nconf = require('nconf');
nconf.use('memory');

const toJson = utils.toJson;
const toJsonStr = utils.toJsonStr;
const has = utils.has;
const isNone = utils.isNone;

router.get('/', (req, res) => {
  let querys = [];
  let compList = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = 'SELECT ' + i + ' AS `dbsIdx`,`company`,`id`,`createTime`,`agent` FROM `' + db.TB_COMPANY + '`; ';
    querys[i] = db.pr_query(i, qStr);
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if (result.err || result.data.length === 0) {
      continue;
    }
    compList = compList.concat(result.data);
  }
  if(req.query.json) {
    return res.send(compList);
  }

  let retStr = '<html><head>';
  retStr += '<style> table, th, td { border: 1px solid black; border-collapse: collapse; } th, td { padding: 5px; text-align: left; }</style>';
  retStr += '</head><body><p>';
  retStr += '<a href="/_debug/iosw">IOSW List</a> | ';
  retStr += '<a href="/_debug/servlog">Logging List</a> | ';
  retStr += '<a href="/_debug/mcache/reset">Reset Cache</a> | ';
  retStr += '<a href="/_debug/company/fewdev">CompFewDev</a> | ';
  retStr += '<a href="/_debug/dbstat">DB State</a> | ';
  retStr += '<input type="text" placeholder="device mac" id="findSn"><button onclick="window.location.href=\'/_debug/device?sn=\' + document.getElementById(\'findSn\').value.trim().toLowerCase()">Search</button> | ';
  retStr += '</h3>';
  retStr += '<h3>Company List</h3>';
  retStr += '<table>';
  retStr += '<tr>';
  retStr += '<th>ID</th>';
  retStr += '<th>DB Idx</th>';
  retStr += '<th>Company</th>';
  retStr += '<th>Create</th>';
  retStr += '<th>Agent</th>';
  retStr += '<th>Users</th>';
  retStr += '<th>Devices</th>';
  retStr += '<th>Audit</th>';
  retStr += '<th>Alarm</th>';
  retStr += '</tr>';
  for(let i = 0; i < compList.length; i++) {
    retStr += '<tr>';
    retStr += '<td>' + ((compList[i].id) ? compList[i].id : '') + '</td>';
    retStr += '<td>' + ((typeof compList[i].dbsIdx !== 'undefined') ? compList[i].dbsIdx : '') + '</td>';
    retStr += '<td>' + ((compList[i].company) ? compList[i].company : '') + '</td>';
    retStr += '<td>' + ((compList[i].createTime) ? (new Date(compList[i].createTime * 1000)).toLocaleString() : '') + '</td>';
    retStr += '<td>' + ((compList[i].agent) ? compList[i].agent : '') + '</td>';
    retStr += '<td><a href="/_debug/users?dbsIdx=' + compList[i].dbsIdx + '&companyId=' + compList[i].id + '">Click</a></td>';
    retStr += '<td><a href="/_debug/devices?dbsIdx=' + compList[i].dbsIdx + '&companyId=' + compList[i].id + '">Click</a></td>';
    retStr += '<td><a href="/admin/audit?dbsIdx=' + compList[i].dbsIdx + '&companyId=' + compList[i].id + '">Click</a></td>';
    retStr += '<td><a href="/alarm?dbsIdx=' + compList[i].dbsIdx + '&companyId=' + compList[i].id + '">Click</a></td>';
    retStr += '</tr>';
  }
  retStr += '</table></body></html>';
  return res.send(retStr);
});

router.get('/devices', (req, res) => {
  if(!req.query.companyId || !req.query.dbsIdx) {
    return res.send('Example: <br>https://cloud.ksmt.co/_debug/devices?dbsIdx=XXX&companyId=XXXX<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }

  let dbsIdx = req.query.dbsIdx;
  let companyId = req.query.companyId;
  let qStr = 'SELECT `id`,`createTime`,LOWER(HEX(`sn`)) AS `sn`,`name`,`mo`,`pollTime`,`enServLog` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = ' + companyId + '; ';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(req.query.json) {
    return res.send(result.data);
  }

  let retStr = '<html><head>';
  retStr += '<style> table, th, td { border: 1px solid black; border-collapse: collapse; } th, td { padding: 5px; text-align: left; }</style>';
  retStr += '</head><body>';
  retStr += '<h2>Device List of ' + companyId + ', Total ' + result.data.length + ' devices</h2>';
  retStr += '<table>';
  retStr += '<tr>';
  retStr += '<th>Id</th>';
  retStr += '<th>Device MAC</th>';
  retStr += '<th>Device Name</th>';
  retStr += '<th>Model</th>';
  retStr += '<th>Create</th>';
  retStr += '<th>PT</th>';
  retStr += '<th>EnLog</th>';
  retStr += '<th>Status</th>';
  retStr += '<th>Event</th>';
  retStr += '<th>Profile</th>';
  retStr += '<th>Modbus</th>';
  retStr += '<th>Detail</th>';
  retStr += '<th>DevConf</th>';
  retStr += '<th>Ctrlblk</th>';
  retStr += '</tr>';

  let querys = [];
  for(let i = 0; i < result.data.length; i++) {
    querys[i] = device.get(dbsIdx, result.data[i].sn);
  }
  let results = await(querys);
  for(let i = 0; i < result.data.length; i++) {
    let devConf = results[i];
    if(!devConf) {
      continue;
    }
    retStr += '<tr>';
    retStr += '<td>' + ((result.data[i].id) ? result.data[i].id : '') + '</td>';
    retStr += '<td>' + ((result.data[i].sn) ? hex2mac(result.data[i].sn) : '') + '</td>';
    retStr += '<td>' + ((result.data[i].name) ? result.data[i].name : '') + '</td>';
    retStr += '<td>' + ((result.data[i].mo) ? result.data[i].mo: '') + '</td>';
    retStr += '<td>' + ((result.data[i].createTime) ? (new Date(result.data[i].createTime * 1000)).toLocaleString() : '') + '</td>';
    retStr += '<td>' + ((result.data[i].pollTime) ? result.data[i].pollTime: '') + '</td>';
    retStr += '<td>' + ((result.data[i].enServLog) ? result.data[i].enServLog: '') + '</td>';
    if(devConf && devConf.status === 1) {
      retStr += '<td><strong>Online</strong> (' + devConf.status + ')</td>';
    } else {
      retStr += '<td>Offline (' + devConf.status + ')</td>';
    }
    retStr += '<td><a href="/devices/evtlog/' + hex2mac(result.data[i].sn) + '?dbsIdx=' + dbsIdx + '&companyId=' + companyId + '">Click</a></td>';
    retStr += '<td><a href="/_debug/profile?sn=' + hex2mac(result.data[i].sn) + '">Click</a></td>';
    retStr += '<td><a href="/_debug/mbval?sn=' + hex2mac(result.data[i].sn) + '">Click</a></td>';
    retStr += '<td><a href="/_debug/device?sn=' + hex2mac(result.data[i].sn) + '">Click</a></td>';
    retStr += '<td><a href="/_debug/mcache/reset/device?dbsIdx=' + dbsIdx + '&companyId=' + companyId + '&sn=' + result.data[i].sn + '">Reset</a></td>';
    retStr += '<td><a href="/_debug/mcache/reset/ctrlblk?dbsIdx=' + dbsIdx + '&companyId=' + companyId + '&sn=' + result.data[i].sn + '">Reset</a></td>';
    retStr += '</tr>';

    // Master: list all its slave devices
    if(!devConf.slvDev) {
      continue;
    }
    for(let id in devConf.slvDev) {
      retStr += '<tr>';
      retStr += '<td>' + id + '</td>';
      retStr += '<td>  ⇨  </td>';
      retStr += '<td>' + devConf.slvDev[id] + '</td>';
      retStr += '<td></td>';
      retStr += '<td></td>';
      retStr += '<td></td>';
      retStr += '<td></td>';
      retStr += '<td></td>';
      retStr += '<td></td>';
      retStr += '<td><a href="/_debug/profile?sn=' + hex2mac(result.data[i].sn) + '&slvId=' + id + '">Click</a></td>';
      retStr += '<td><a href="/_debug/mbval?sn=' + hex2mac(result.data[i].sn) + '&slvId=' + id + '">Click</a></td>';
      retStr += '<td><a href="/_debug/slvdev?sn=' + hex2mac(result.data[i].sn) + '&slvId=' + id + '">Click</a></td>';
      retStr += '<td></td>';
      retStr += '<td></td>';
      retStr += '</tr>';
    }
  }
  retStr += '</table></body></html>';
  return res.send(retStr);
});

let findSession = (targeAccount, sResult) => {
  if(!sResult) {
    return null;
  }
  for(let i = 0; i < sResult.length; i++) {
    if(sResult[i].account === targeAccount) {
      return i;
    }
  }
  return null;
};

router.get('/users', (req, res) => {
  if(!req.query.companyId) {
    return res.send('Example: <br>https://cloud.ksmt.co/_debug/users?dbsIdx=XXX&companyId=XXXX<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }

  let dbsIdx = req.query.dbsIdx;
  let companyId = req.query.companyId;
  let qStr = 'SELECT `id`,`createTime`,`account`,`name`,`admin`,`lang`,`pushType`,`gcmId` FROM `' + db.TB_USER + '` WHERE `companyId` = ' + companyId + '; ';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(req.query.json) {
    return res.send(result.data);
  }

  let userResult = result.data;
  let sResult = await(sessionStore.getByCompany(dbsIdx, companyId));
  let retStr = '<html><head>';
  retStr += '<style> table, th, td { border: 1px solid black; border-collapse: collapse; } th, td { padding: 5px; text-align: left; }</style>';
  retStr += '</head><body>';
  retStr += '<h2>User List of ' + companyId + ', Total ' + userResult.length + ' users</h2>';
  retStr += '<table>';
  retStr += '<tr>';
  retStr += '<th>Id</th>';
  retStr += '<th>Create Time</th>';
  retStr += '<th>Account</th>';
  retStr += '<th>User Name</th>';
  retStr += '<th>Admin</th>';
  retStr += '<th>Expire</th>';
  retStr += '<th>Language</th>';
  retStr += '<th>Push Type</th>';
  retStr += '<th>Push ID</th>';
  retStr += '<th>Session ID</th>';
  retStr += '</tr>';
  for(let i = 0; i < userResult.length; i++) {
    let findId = findSession(userResult[i].account, sResult);
    retStr += '<tr>';
    retStr += '<td>' + ((userResult[i].id) ? userResult[i].id : '') + '</td>';
    retStr += '<td>' + ((userResult[i].createTime) ? (new Date(userResult[i].createTime * 1000)).toLocaleString() : '') + '</td>';
    retStr += '<td>' + ((userResult[i].account) ? userResult[i].account : '') + '</td>';
    retStr += '<td>' + ((userResult[i].name) ? userResult[i].name : '') + '</td>';
    retStr += '<td>' + userResult[i].admin + '</td>';
    if(findId) {
      let _expires = parseInt(sResult[findId].expires) * 1000;
      let status = (Date.now() > _expires) ? 'Offline' : '<strong>Online<strong>';
      retStr += '<td>' + status + ' ' + ((new Date(_expires)).toLocaleString()) + '</td>';
    } else {
      retStr += '<td>Offline</td>';
    }
    retStr += '<td>' + ((userResult[i].lang) ? userResult[i].lang: '') + '</td>';
    retStr += '<td>' + prj.LC_CONFS[userResult[i].pushType].CLOUD + ',' + prj.LC_CONFS[userResult[i].pushType].TYPE + '</td>';
    retStr += '<td>' + ((userResult[i].gcmId) ? userResult[i].gcmId: '') + '</td>';
    retStr += '<td>' + ((findId) ? sResult[findId].session : '')  + '</td>';
    retStr += '</tr>';
  }
  retStr += '</table></body></html>';
  return res.send(retStr);
});

router.get('/iosw', (req, res) => {
  let retStr = '<html><head>';
  retStr += '<style> table, th, td { border: 1px solid black; border-collapse: collapse; } th, td { padding: 5px; text-align: left; }</style>';
  retStr += '</head><body>';
  retStr += '<h3>I/O Switch List<br><small><a href="/_debug/iosw/reset">Reset Table</a></small></h3>';
  retStr += '<table>';
  retStr += '<tr>';
  retStr += '<th>Device</th>';
  retStr += '<th>Settings</th>';
  retStr += '</tr>';

  let querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = 'SELECT DISTINCT(LOWER(HEX(`sn`))) AS `sn` FROM `' + db.TB_IOSW + '` ';
    qStr += 'UNION SELECT DISTINCT(LOWER(HEX(`swSN`))) AS `sn` FROM `' + db.TB_IOSW + '`;';
    querys[i] = db.pr_query(i, qStr);
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if(!result || result.err || result.data.length === 0) {
      continue;
    }
    let dbsIdx = i;
    for(let j = 0; j < result.data.length; j++) {
      let sn = hex2mac(result.data[j].sn)
      retStr += '<tr>';
      retStr += '<td>' + sn + '</td>';
      retStr += '<td><a href="/_debug/device?sn=' + sn + '">check</a></td>';
      retStr += '</tr>';
    }
  }
  retStr += '</table></body></html>';
  return res.send(retStr);
});

router.get('/mbval', (req, res) => {
  if(!req.query.sn) {
    return res.send('Example: <br>https://cloud.ksmt.co/_debug/mbval?sn=28:65:6b:00:11:22<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }
  let sn = mac2hex(db.escape(req.query.sn));
  let dbsIdx = await(device.getDBSIdx(sn));
  if(dbsIdx < 0) {
    return res.send(gstate.NO_DEV + '<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }

  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf) {
    return res.send(gstate.NO_DEV + '<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }

  // let ctrlData = await(ctrlblk.get(dbsIdx, sn));
  let mbData = await(mbval.getAll(dbsIdx, sn));
  if(model.isMbusMaster(devConf.mo) && req.query.slvId) {
    let slvId = parseInt(req.query.slvId);
    for(let addr in mbData) {
      if(getSlvId(addr) !== slvId) {
        delete mbData[addr];
      }
    }
  }
  if(req.query.json) {
    return res.send('<pre>' + JSON.stringify(mbData, null, 4) + '</pre>');
  } else {
    // let mbData = await(mbval.getAll(dbsIdx, sn));
    let retStr = '<html><head>';
    retStr += '<style> table, th, td { border: 1px solid black; border-collapse: collapse; } th, td { padding: 5px; text-align: left; }</style>';
    retStr += '</head><body>';
    retStr += '<h2>Modbus Value ' + req.query.sn + '</h2>';
    retStr += '<table><tr>';
    retStr += '<th>Register</th>';
    retStr += '<th>HEX Value</th>';
    retStr += '</tr>';
    Object.keys(mbData).forEach((addr) => {
      retStr += '<tr>';
      retStr += '<td>' + addr + '</td>';
      retStr += '<td>' + mbData[addr] + '</td>';
      retStr += '</tr>';
    });
    retStr += '</table></body></html>';
    return res.send(retStr);
  }
});

router.get('/slvdev', (req, res) => {
  if(!req.query.sn) {
    return res.send('Example: <br>https://cloud.ksmt.co/_debug/slvdev?sn=28:65:6b:00:11:22&slvId=2<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }
  let sid = parseInt(db.escape(req.query.slvId));
  let sn = mac2hex(db.escape(req.query.sn));
  let dbsIdx = await(device.getDBSIdx(sn));
  if(dbsIdx < 0) {
    return res.send(gstate.NO_DEV + '<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }

  let devConf = await(device.get(dbsIdx, sn));
  let companyId = devConf.companyId;
  let qStr = 'SELECT `company` FROM `' + db.TB_COMPANY + '` WHERE `id` = ' + companyId + ' LIMIT 1;';
  qStr += 'SELECT `mstConf` FROM `' + db.TB_DEVICE + '` WHERE `sn` = UNHEX(\'' + sn + '\') AND `companyId` = ' + companyId;
  let result = await(db.pr_query(dbsIdx, qStr));
  if(result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  let mstConf = JSON.parse(result.data[1].mstConf);
  let ret, company = result.data[0].company;
  if(req.query.json) {
    return res.send('<pre>' + JSON.stringify({
      dev: devConf,
      company: result.data[0].company,
      mstConf: mstConf,
    }, null, 4) + '</pre>');
  } else {
    ret = {
      'dbsIdx': dbsIdx,
      'Company Id': companyId,
      'Company Name': company,
      'Slave Name': devConf.name + ' -> ' + devConf.slvDev[sid],
      'Type': mstConf[sid].type,
      'Com Port': mstConf[sid].comPort ? mstConf[sid].comPort  : '',
      'Slave ID': mstConf[sid].slvId ? mstConf[sid].slvId : '',
      'TCP IP': mstConf[sid].ip ? mstConf[sid].ip : '',
      'TCP Port': mstConf[sid].port ? mstConf[sid].port : '',
      'Enable': mstConf[sid].enable,
      'DelayPoll': mstConf[sid].delayPoll ? mstConf[sid].delayPoll + ' ms' : '',
      'Timeout': mstConf[sid].timeout ? mstConf[sid].timeout + ' ms' : '',
      'Max Retry': mstConf[sid].maxRetry ? mstConf[sid].maxRetry : '',
      'Modbus Value': '<a href="/_debug/mbval?sn=' + hex2mac(devConf.sn) + '&slvId=' + sid + '">Click</a>',
      'View Profile': '<a href="/_debug/profile?sn=' + hex2mac(devConf.sn) + '&slvId=' + sid + '">Click</a>',
      'Slave Profile': '<a href="/device/profile/' + hex2mac(devConf.sn) + '?slvIdx=' + sid + '">Download</a>',
    };
    let retStr = '<html><head>';
    retStr += '<style> table, th, td { border: 1px solid black; border-collapse: collapse; } th, td { padding: 5px; text-align: left; }</style>';
    retStr += '</head><body>';
    retStr += '<h2>Device Settings ' + req.query.sn + ' ' + ((req.query.slvId) ? ', Slave ' + req.query.slvId : '') +'</h2>';
    retStr += '<table>';
    Object.keys(ret).forEach((key) => {
      retStr += '<tr>';
      retStr += '<td>' + key + '</td>';
      retStr += '<td>' + ret[key] + '</td>';
      retStr += '</tr>';
    });
    retStr += '</table></body></html>';
    return res.send(retStr);
  }
});

router.get('/device', (req, res) => {
  if(!req.query.sn) {
    return res.send('Example: <br>https://cloud.ksmt.co/_debug/device?sn=28:65:6b:00:11:22<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }
  let sn = mac2hex(db.escape(req.query.sn));
  let dbsIdx = await(device.getDBSIdx(sn));
  if(dbsIdx < 0) {
    return res.send(gstate.NO_DEV + '<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }

  let devConf = await(device.get(dbsIdx, sn));
  let companyId = devConf.companyId;
  let qStr = 'SELECT `company` FROM `' + db.TB_COMPANY + '` WHERE `id` = ' + companyId + ' LIMIT 1;';
  qStr += 'SELECT `id`,`account`,`name`,`admin`,`activate`,`allowDown`,`allowUp`,`pushType`,`gcmId` FROM `' + db.TB_USER + '` WHERE `companyId` = ' + companyId + ' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if(result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  let ret, company = result.data[0].company;
  if(req.query.json) {
    return res.send('<pre>' + JSON.stringify({
      dev: devConf,
      company: result.data[0].company,
      users: result.data[1],
    }, null, 4) + '</pre>');
  } else {
    let rcmdStr = '';
    for(let i = 0; i < devConf.rcmd.length; i++) {
      rcmdStr += devConf.rcmd[i] + '<br>';
    }
    ret = {
      'dbsIdx': dbsIdx,
      'Company Id': companyId,
      'Company Name': company,
      'Company Admin': result.data[1].account,
      'Company Admin Id': result.data[1].id,
      'Device Id': devConf.id,
      'Device Name': devConf.name,
      'Device Model': devConf.mo,
      'Device F/W': devConf.fwVer,
      'PollTime': devConf.pollTime,
      'Device Status': (devConf.status === 0) ? 'Disconnected' : 'Connected',
      'Sequence Number': devConf.seq,
      'Enable Logging': (devConf.enLog === 1) ? true : false,
      'Enable Server Logging': (devConf.enServLog === 1) ? true : false,
      'Logging Frequencey': devConf.logFreq + ' sec',
      'Connected IP/Host': devConf.ip + ' (<a href="http://whatismyipaddress.com/ip/' + devConf.ip + '">Check IP location</a>) ',
      'Last Updated Time': (new Date(devConf.lastUpdate)).toLocaleString() + ' (Timestamp: ' + devConf.lastUpdate + ')',
      'Modbus Value': '<a href="/_debug/mbval?sn=' + devConf.sn + '">Click</a>',
      'View Profile': '<a href="/_debug/profile?sn=' + devConf.sn + '">Click</a>',
      'View Event': '<a href="/devices/evtlog/' + devConf.sn + '?dbsIdx=' + dbsIdx + '&companyId=' + companyId + '">Click</a>',
      'Profile Download': '<a href="/device/profile/' + devConf.sn + '">Download</a>',
      'User List': '<a href="/_debug/users?dbsIdx=' + dbsIdx + '&companyId=' + devConf.companyId + '">Click</a>',
      'Device List': '<a href="/_debug/devices?dbsIdx=' + dbsIdx + '&companyId=' + devConf.companyId + '">Click</a>',
      'Reponse commands (To Deice)': rcmdStr,
    };

    let retStr = '<html><head>';
    retStr += '<style> table, th, td { border: 1px solid black; border-collapse: collapse; } th, td { padding: 5px; text-align: left; }</style>';
    retStr += '</head><body>';
    retStr += '<h2>Device Settings ' + req.query.sn + '</h2>';
    retStr += '<table>';
    Object.keys(ret).forEach((key) => {
      retStr += '<tr>';
      retStr += '<td>' + key + '</td>';
      retStr += '<td>' + ret[key] + '</td>';
      retStr += '</tr>';
    });
    retStr += '</table></body></html>';
    return res.send(retStr);
  }
});

router.get('/profile', (req, res) => {
  if(!req.query.sn) {
    return res.send('Example: <br>https://cloud.ksmt.co/_debug/profile?sn=28:65:6b:00:11:22&slvId=2<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }
  let sn = mac2hex(db.escape(req.query.sn));
  let dbsIdx = await(device.getDBSIdx(sn));
  if(dbsIdx < 0) {
    return res.send(gstate.NO_DEV + '<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }

  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf) {
    return res.send(gstate.NO_DEV + '<br/><br/><a href="javascript:history.back()">Go back!</a>');
  }

  // Show only slave address
  let ctrlData = await(ctrlblk.get(dbsIdx, sn));
  if(model.isMbusMaster(devConf.mo) && req.query.slvId) {
    let slvId = parseInt(req.query.slvId);
    for(let addr in ctrlData) {
      if(getSlvId(addr) !== slvId) {
        delete ctrlData[addr];
      }
    }
  }
  if(req.query.json) {
    if(req.query.addr) {
      if(req.query.addr instanceof Array) {
        let ctrlblks = {};
        for(let i = 0; i < req.query.addr.length; i++) {
          ctrlblks[req.query.addr[i]] = ctrlData[req.query.addr[i]];
        }
        return res.send('<pre>' + JSON.stringify(ctrlblks, null, 4) + '</pre>');
      } else {
        return res.send('<pre>' + JSON.stringify(ctrlData[req.query.addr], null, 4) + '</pre>');
      }
    } else {
      return res.send('<pre>' + JSON.stringify(ctrlData, null, 4) + '</pre>');
    }
  } else {
    let _ctrlData = {};
    if(req.query.addr) {
      if(req.query.addr instanceof Array) {
        for(let i = 0; i < req.query.addr.length; i++) {
          _ctrlData[req.query.addr[i]] = ctrlData[req.query.addr[i]];
        }
      } else {
        _ctrlData[req.query.addr] = ctrlData[req.query.addr];
      }
      ctrlData = _ctrlData;
    }
    let id = 0;
    let retStr = '<html><head>';
    retStr += '<style> table, th, td { border: 1px solid black; border-collapse: collapse; } th, td { padding: 5px; text-align: left; }</style>';
    retStr += '</head><body>';
    retStr += '<h2>Profile ' + req.query.sn + '</h2>';
    retStr += '<table>';
    retStr += '<tr>';
    retStr += '<th>#</th>';
    retStr += '<th>Addr</th>';
    retStr += '<th>Id</th>';
    retStr += '<th>Desc</th>';
    retStr += '<th>Type</th>';
    retStr += '<th>LimitId</th>';
    retStr += '<th>Haddr</th>';
    retStr += '<th>Laddr</th>';
    retStr += '<th>Fpt</th>';
    retStr += '<th>ON</th>';
    retStr += '<th>OFF</th>';
    retStr += '<th>BtnTime</th>';
    retStr += '<th>RefReg</th>';
    retStr += '<th>Eq</th>';
    retStr += '<th>Up</th>';
    retStr += '<th>Low</th>';
    retStr += '<th>Dur</th>';
    retStr += '<th>Pri</th>';
    retStr += '<th>Min</th>';
    retStr += '<th>Min</th>';
    retStr += '<th>SwID</th>';
    retStr += '<th>SwSN</th>';
    retStr += '<th>SwAddr</th>';
    retStr += '</tr>';
    Object.keys(ctrlData).forEach((addr) => {
      retStr += '<tr>';
      retStr += '<td>' + (id++) + '</td>';
      retStr += '<td>' + addr + '</td>';
      retStr += '<td>' + ((ctrlData[addr].id)      ? ctrlData[addr].id : '')      + '</td>';
      retStr += '<td>' + ((ctrlData[addr].desc)    ? ctrlData[addr].desc : '')    + '</td>';
      retStr += '<td>' + iotype.IO_TYPE[ctrlData[addr].type] + ' (' + ctrlData[addr].type + ')</td>';
      retStr += '<td>' + ((ctrlData[addr].limitId) ? ctrlData[addr].limitId : '')   + '</td>';
      retStr += '<td>' + ((ctrlData[addr].haddr)   ? ctrlData[addr].haddr : '')   + '</td>';
      retStr += '<td>' + ((ctrlData[addr].laddr)   ? ctrlData[addr].laddr : '')   + '</td>';
      retStr += '<td>' + ((ctrlData[addr].fpt)     ? ctrlData[addr].fpt : '')     + '</td>';
      retStr += '<td>' + ((ctrlData[addr].on)      ? ctrlData[addr].on : '')      + '</td>';
      retStr += '<td>' + ((ctrlData[addr].off)     ? ctrlData[addr].off : '')     + '</td>';
      retStr += '<td>' + ((ctrlData[addr].btnTime) ? ctrlData[addr].btnTime : '') + '</td>';
      retStr += '<td>' + ((ctrlData[addr].refReg)  ? ctrlData[addr].refReg : '')  + '</td>';
      retStr += '<td>' + ((ctrlData[addr].eq)      ? ctrlData[addr].eq : '')      + '</td>';
      retStr += '<td>' + ((ctrlData[addr].up)      ? ctrlData[addr].up : '')      + '</td>';
      retStr += '<td>' + ((ctrlData[addr].low)     ? ctrlData[addr].low : '')     + '</td>';
      retStr += '<td>' + ((ctrlData[addr].dur)     ? ctrlData[addr].dur : '')     + '</td>';
      retStr += '<td>' + ((ctrlData[addr].pri)     ? ctrlData[addr].pri : '')     + '</td>';
      retStr += '<td>' + ((ctrlData[addr].max)     ? ctrlData[addr].max : '')     + '</td>';
      retStr += '<td>' + ((ctrlData[addr].min)     ? ctrlData[addr].min : '')     + '</td>';
      retStr += '<td>' + ((ctrlData[addr].swId)    ? ctrlData[addr].swId : '')    + '</td>';
      retStr += '<td>' + ((ctrlData[addr].swSN)    ? ctrlData[addr].swSN : '')    + '</td>';
      retStr += '<td>' + ((ctrlData[addr].swAddr)  ? ctrlData[addr].swAddr : '')  + '</td>';
      retStr += '</tr>';
    });
    retStr += '</table></body></html>';
    return res.send(retStr);
  }
});

router.get('/nconf', (req, res) => {
  if(req.query.type) {
    if(req.query.type.match(/^c/i)) {
      return res.send('<pre>' + JSON.stringify(nconf.get('config'), null, 4) + '</pre>');
    } else if(req.query.type.match(/^s/i)) {
      return res.send('<pre>' + JSON.stringify(nconf.get('status'), null, 4) + '</pre>');
    } else if(req.query.type.match(/^m/i)) {
      return res.send('<pre>' + JSON.stringify(nconf.get('mcache'), null, 4) + '</pre>');
    }
  } else {
    return res.send('<pre>' + JSON.stringify({
      config: nconf.get('config'),
      status: nconf.get('status'),
      mcache: nconf.get('mcache')
    }, null, 4) + '</pre>');
  }
});

router.get('/mcache/remove/type9', (req, res) => {
  if (!req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send('Permission deny! <a href="javascript:history.back()">Go back!</a>');
  }

  let querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, 'SELECT LOWER(HEX(`sn`)) AS `sn` FROM `' + db.TB_DEVICE + '`;');
  }

  let remoevQuerys = {};
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    if(!results[i] || results[i].err || results[i].data.length === 0) {
      continue;
    }
    let dbsIdx = i;
    for(let j = 0; j < results[i].data.length; j++) {
      let sn = results[i].data[j].sn;
      remoevQuerys[sn] = db.pr_wquery(dbsIdx, 'DELETE FROM `' + db.TB_MCACHE + '_' + sn + '` WHERE `type` = 9;');
    }
    remoevQuerys[0] = db.pr_wquery(dbsIdx, 'DROP TABLE IF EXISTS `' + db.TB_MCACHE + '`;');
  }
  await(remoevQuerys);
  return res.status(gstate.RC_OK).send('Success! <a href="javascript:history.back()">Go back!</a>');
});

router.get('/mcache/reset', (req, res) => {
  if (!req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send('Permission deny! <a href="javascript:history.back()">Go back!</a>');
  }

  let querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, 'SELECT LOWER(HEX(`sn`)) AS `sn` FROM `' + db.TB_DEVICE + '`;');
  }
  let devQuerys = {};
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    if(!results[i] || results[i].err || results[i].data.length === 0) {
      continue;
    }
    let dbsIdx = i;
    for(let j = 0; j < results[i].data.length; j++) {
      let sn = results[i].data[j].sn;
      devQuerys[sn] = db.pr_wquery(dbsIdx, 'DELETE FROM `' + db.TB_MCACHE + '_' + sn + '` WHERE ((`key` = \'DEV_FAST_PT\' OR `key` = \'CTRLBLK\' OR `key` = \'DEV-CONF\'));');
    }
  }
  await(devQuerys);

  let init_querys = {};
  for(let i = 0; i < prj.DBS.length; i++) {
    init_querys['device-' + i] = device.init(i);
    init_querys['ctrlblk-' + i] = ctrlblk.init(i);
  }
  await(init_querys);
  return res.status(gstate.RC_OK).send('Success! <a href="javascript:history.back()">Go back!</a>');

});

router.get('/mcache/reset/device', (req, res) => {
  if (!req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send('Permission deny! <a href="javascript:history.back()">Go back!</a>');
  }
  if(isNone(req.query.sn) || isNone(req.query.dbsIdx) || isNone(req.query.companyId)) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  await(device.reset(req.query.dbsIdx, req.query.companyId, req.query.sn));
  return res.status(gstate.RC_OK).send('Success<a href="javascript:history.back()">Go back!</a>');
});

router.get('/mcache/reset/ctrlblk', (req, res) => {
  if (!req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send('<a href="javascript:history.back()">Permission deny! Go back!</a>');
  }
  if(isNone(req.query.sn) || isNone(req.query.dbsIdx) || isNone(req.query.companyId)) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  await(ctrlblk.reset(req.query.dbsIdx, req.query.companyId, req.query.sn));
  return res.status(gstate.RC_OK).send('Success! <a href="javascript:history.back()">Go back!</a>');
});

router.get('/iosw/reset', (req, res) => {
  if (!req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send('Permission deny! <a href="javascript:history.back()">Go back!</a>');
  }

  let querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, 'DELETE FROM `' + db.TB_IOSW + '`;');
  }
  await(querys);

  querys = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, 'SELECT LOWER(HEX(`sn`)) AS `sn`,`modbus` FROM `' + db.TB_DEVICE + '`;');
  }

  let ioswQuerys = {};
  let ctrlDatas = {};
  let results = await(querys);
  for(let i = 0; i< results.length; i++) {
    let result = results[i];
    if(!result || result.err || result.data.length === 0) {
      continue;
    }
    let dbsIdx = i;
    for(let j = 0; j < result.data.length; j++) {
      let sn = result.data[j].sn;
      ctrlDatas[sn] = {};

      let modbus = toJson(result.data[j].modbus, {__file, __line, sn});
      if(!modbus || !Array.isArray(modbus)) {
        continue;
      }
      for(let k = 0; k < modbus.length; k++) {
        if(!modbus[k].haddr) {
          continue;
        }
        ctrlDatas[sn][modbus[k].haddr] = modbus[k];
      }
    }
    for(let j = 0; j < result.data.length; j++) {
      let sn = result.data[j].sn;
      let ctrlData = ctrlDatas[sn];
      for(let haddr in ctrlData) {
        if(!ctrlData[haddr].swSN) {
          continue;
        }
        let swId = ctrlData[haddr].swId;
        let swSN = mac2hex(ctrlData[haddr].swSN);
        let swAddr = ctrlData[haddr].swAddr;
        if(!ctrlDatas[swSN]         ||
           !ctrlDatas[swSN][swAddr] ||
          ctrlDatas[swSN][swAddr].id !== ctrlData[haddr].swId) { // not such id
          continue;
        }
        ioswQuerys[haddr + j] = iosw.set(dbsIdx, sn, haddr, swSN, swAddr);
      }
    }
  }
  await(ioswQuerys);
  return res.status(gstate.RC_OK).send('Success! <a href="javascript:history.back()">Go back!</a>');
});

router.get('/company/fewdev', (req, res) => {
  let querys = [];
  let compList = [];
  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = 'SELECT ' + i + ' AS `dbsIdx`,`company`,`id`,`createTime` FROM `' + db.TB_COMPANY + '`; ';
    querys[i] = db.pr_query(i, qStr);
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if (result.err || result.data.length === 0) {
      continue;
    }
    compList = compList.concat(result.data);
  }

  querys = [];
  for(let i = 0; i < compList.length; i++) {
    let dbsIdx = compList[i].dbsIdx;
    let companyId = compList[i].id;
    querys[i] = db.pr_query(dbsIdx, 'SELECT `id` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = ' + companyId + ' LIMIT 3;');
  }
  let numDevs = await(querys);

  let retStr = '<html><head>';
  retStr += '<style> table, th, td { border: 1px solid black; border-collapse: collapse; } th, td { padding: 5px; text-align: left; }</style>';
  retStr += '</head><body>';
  retStr += '<h2>Company with few devices (less than 3 devices)</h2>';
  retStr += '<table>';
  retStr += '<tr>';
  retStr += '<th>ID</th>';
  retStr += '<th>DB Idx</th>';
  retStr += '<th>Company Name</th>';
  retStr += '<th>Create</th>';
  retStr += '<th># of devices</th>';
  retStr += '</tr>';
  for(let i = 0; i < compList.length; i++) {
    if(parseInt(numDevs[i].data.length)  === 3) {
      continue;
    }
    retStr += '<tr>';
    retStr += '<td>' + ((compList[i].id) ? compList[i].id : '') + '</td>';
    retStr += '<td>' + ((typeof compList[i].dbsIdx !== 'undefined') ? compList[i].dbsIdx : '') + '</td>';
    retStr += '<td>' + ((compList[i].company) ? compList[i].company : '') + '</td>';
    retStr += '<td>' + ((compList[i].createTime) ? (new Date(compList[i].createTime * 1000)).toLocaleString() : '') + '</td>';
    retStr += '<td>' + numDevs[i].data.length + '</td>';
    retStr += '</tr>';
  }
  retStr += '</table></body></html>';
  return res.send(retStr);
});

router.get('/servlog', (req, res) => {
  let retStr = '<html><head>';
  retStr += '<style> table, th, td { border: 1px solid black; border-collapse: collapse; } th, td { padding: 5px; text-align: left; }</style>';
  retStr += '</head><body>';
  retStr += '<h2>Server logging Devices</h2>';
  retStr += '<table>';
  retStr += '<tr>';
  retStr += '<th>Device MAC</th>';
  retStr += '<th>Device Name</th>';
  retStr += '<th>Model</th>';
  retStr += '<th>Settings</th>';
  retStr += '</tr>';

  let querys = [];
  let qStr = 'SELECT `createTime`,LOWER(HEX(`sn`)) AS `sn`,`name`,`mo` FROM `' + db.TB_DEVICE + '` WHERE `enServLog` = 1;';
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, qStr);
  }
  let results = await(querys);
  for(let i = 0; i < querys.length; i++) {
    if(!results[i] || results[i].err || results[i].data.length === 0) {
      continue;
    }
    for(let j = 0; j < results[i].data.length; j++) {
      let dev = results[i].data[j];
      retStr += '<tr>';
      retStr += '<td>' + ((dev.sn)   ? hex2mac(dev.sn) : '') + '</td>';
      retStr += '<td>' + ((dev.name) ? dev.name : '') + '</td>';
      retStr += '<td>' + ((dev.mo)   ? dev.mo: '') + '</td>';
      retStr += '<td><a href="/_debug/device?sn=' + hex2mac(dev.sn) + '">Click</a></td>';
      retStr += '</tr>';            
    }
  }
  retStr += '</table></body></html>';
  return res.send(retStr);
});

router.get('/dbstat', (req, res) => {
  await(db.chkDBPools());

  let ret = '<style type="text/css"> .tg {border-collapse:collapse;border-spacing:0;border-color:#ccc;} .tg td{font-family:Arial, sans-serif;font-size:14px;padding:15px 10px;border-style:solid;border-width:0px;overflow:hidden;word-break:normal;border-color:#ccc;color:#333;background-color:#fff;border-top-width:1px;border-bottom-width:1px;} .tg th{font-family:Arial, sans-serif;font-size:14px;font-weight:normal;padding:15px 10px;border-style:solid;border-width:0px;overflow:hidden;word-break:normal;border-color:#ccc;color:#333;background-color:#f0f0f0;border-top-width:1px;border-bottom-width:1px;} .tg .tg-7ofl{font-weight:bold;font-size:14px;font-family:Arial, Helvetica, sans-serif !important;;background-color:#ffce93;text-align:center} .tg .tg-lrzf{font-size:14px;font-family:Arial, Helvetica, sans-serif !important;;text-align:center} .tg .tg-k53e{font-size:14px;font-family:Arial, Helvetica, sans-serif !important;;background-color:#ffffc7} .tg .tg-yw4l{vertical-align:top} </style>';
  ret += '<table class="tg"><tr>';
  ret += '<th class="tg-7ofl">Address</th>';
  ret += '<th class="tg-7ofl">Online</th>';
  ret += '<th class="tg-7ofl">Open Files</th>';
  ret += '<th class="tg-7ofl">Delayed Insert Threads</th>';
  ret += '<th class="tg-7ofl">Max Used Conn</th>';
  ret += '<th class="tg-7ofl">Cluster<br/>(Cnted/Total)</th>';
  ret += '<th class="tg-7ofl">Threads<br/>(Running/Cache/Cnted/Created)</th>';
  ret += '<th class="tg-7ofl">ROW Lock<br/>(Waits/TimeAvg/TimeMax)</th>';
  ret += '</tr>';
  for(let i = 0; i < prj.DBS.length; i++) {
    ret += '<tr><td class="tg-k53e" colspan="8">Site ' + i + ', Write Idx: ' + prj.DBS[i].WIDX + '</td></tr>';
    for(let j = 0; j < prj.DBS[i].POOLS.length; j++) {
      ret += '<tr>';
      ret += '<td class="tg-yw4l">' + prj.DBS[i].POOLS[j].ADDR + '</td>';
      ret += '<td class="tg-yw4l">' + prj.DBS[i].POOLS[j].STAT + '</td>';
      if(typeof prj.DBS[i].POOLS[j].OPEN_FILES === 'undefined') {
        ret += '<td class="tg-lrzf"></td>';
        ret += '<td class="tg-lrzf"></td>';
        ret += '<td class="tg-lrzf"></td>';
        ret += '<td class="tg-lrzf"></td>';
        ret += '<td class="tg-lrzf"></td>';
        ret += '<td class="tg-lrzf"></td>';
      } else {
        ret += '<td class="tg-lrzf">' + prj.DBS[i].POOLS[j].OPEN_FILES + '</td>';
        ret += '<td class="tg-lrzf">' + prj.DBS[i].POOLS[j].DELAYED_INSERT_THREADS + '</td>';
        ret += '<td class="tg-lrzf">' + prj.DBS[i].POOLS[j].MAX_USED_CONNECTIONS + '</td>';
        ret += '<td class="tg-lrzf">' + prj.DBS[i].POOLS[j].WSREP_THREAD_COUNT + '/' + prj.DBS[i].POOLS[j].WSREP_CLUSTER_SIZE + '</td>';
        ret += '<td class="tg-lrzf">' + prj.DBS[i].POOLS[j].THREADS_RUNNING + '/' + prj.DBS[i].POOLS[j].THREADS_CACHED + '/' + prj.DBS[i].POOLS[j].THREADS_CONNECTED + '/' + prj.DBS[i].POOLS[j].THREADS_CREATED  + '</td>';
        ret += '<td class="tg-lrzf">' + prj.DBS[i].POOLS[j].INNODB_ROW_LOCK_CURRENT_WAITS + '/' + prj.DBS[i].POOLS[j].INNODB_ROW_LOCK_TIME_AVG + '/' + prj.DBS[i].POOLS[j].INNODB_ROW_LOCK_TIME_MAX + '</td>';
      }
      ret += '</tr>';
    }
  }
  ret += '</table>';
  return res.status(gstate.RC_OK).send(ret);
});

module.exports = router;
