const express = require('express');
const router = express.Router();
const prj = require('../project');
const db = require(prj.DB_PATH);
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');
const gstate = require(prj.GSTATE_PATH);
const csid = require(prj.LIB_PATH + '/csid');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;

router.get('/', (req, res) => {
  if (!req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let saCfg = await(csid.get('C', 'LILU_SACFG'));
  if(!saCfg) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }
  let result = [];
  saCfg = utils.toJson(saCfg, {__file, __line});
  let ids = Object.keys(saCfg);
  for(let i = 0; i < ids.length; i++) {
    result.push({
      id: ids[i],
      company: saCfg[ids[i]].name,
    });
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    total: ids.length,
    companies: result,
  });
});

router.get('/unread', (req, res) => {
  if (!req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let saCfg = await(csid.get('C', 'LILU_SACFG'));
  let unread = await(csid.get('C', 'LILU_UNREAD'));
  if(!saCfg || !unread) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }
  saCfg = utils.toJson(saCfg, {__file, __line});
  unread = utils.toJson(unread, {__file, __line});

  let ret = [];
  let ids = Object.keys(saCfg);
  for(let i = 0; i < ids.length; i++) {
    let num = 0;
    let companyId = ids[i];
    let lastTime = utils.isNone(unread[companyId]) ? 0 : unread[companyId];
    let dbsIdx = saCfg[companyId].dbsIdx;
    let qStr = 'SELECT COUNT(`time`) AS `num` FROM `' + db.TB_ALARM_LOG + '` ' + 'WHERE `companyId` = \'' + companyId + '\' AND `time` > ' + lastTime + ' LIMIT 1;';
    let result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else if(result.data.length === 0) {
      num = 0;
    } else {
      num = result.data[0].num;
    }
    ret.push({
      id: companyId,
      time: lastTime,
      num: num            
    });
  }
  return res.send({
    desc: gstate.OK, 
    unread: ret
  });                
});

router.put('/unread/:companyId/:time', (req, res) => {
  if (!req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  
  let time = parseInt(db.escape(req.params.time));
  let companyId = db.escape(req.params.companyId);
  if(!time || !companyId) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});        
  } 
  
  let unread = await(csid.get('C', 'LILU_UNREAD'));    
  if(!unread) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }

  unread = utils.toJson(unread, {__file, __line});
  if(typeof unread[companyId] === 'undefined') {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }    
  unread[companyId] = time;
  await(csid.set('C', 'LILU_UNREAD', utils.toJsonStr(unread, {__file, __line})));
  return res.end();
});

module.exports = router;
