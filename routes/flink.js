const express = require('express');
const router = express.Router();
const formidable = require('formidable');
const prj = require('../project');
const db = require(prj.DB_PATH);
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');
const audit = require(prj.LIB_PATH + '/audit');
const gstate = require(prj.GSTATE_PATH);
const csid = require(prj.LIB_PATH + '/csid');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;

const getURLById = (dbsIdx, companyId, id) => {
  let qStr = 'SELECT `desc`,`url` FROM `' + db.TB_FLINK + '` WHERE `id` = \'' + id + '\' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return result;
  } else if(result.data.length === 0) {
    return {err: gstate.NO_RECORD};
  }
  return {data: result.data[0]};
};

router.get('/', (req, res) => {
  let companyId, dbsIdx;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId && req.query.dbsIdx) {
    dbsIdx = req.query.dbsIdx;
    companyId = req.query.companyId;
  } else {
    dbsIdx = req.session.user.dbsIdx;
    companyId = req.session.user.companyId;
  }

  let MAX_FILE_LINK = await(csid.get('C','MAX_FILE_LINK','int'));
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_FILE_LINK) ? db.escape(req.query.num) : MAX_FILE_LINK;
  let id  = (req.query.id) ? ' AND `id` = \'' + db.escape(req.query.id)  + '\'' : '' ;

  let qStr = '';
  qStr += 'SELECT COUNT(`id`) AS `total` FROM `' + db.TB_FLINK + '` WHERE `companyId` = ' + companyId + '; ';
  qStr += 'SELECT `id`,`desc`,`url` FROM `' + db.TB_FLINK + '` WHERE `companyId` = \'' + companyId + '\'' + id + ' LIMIT ' + num + ' OFFSET ' + from + ';';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  let total = result.data[0].total;
  result.data.shift();
  return res.send({
    desc: gstate.OK,
    total: total,
    from: ((from) ? from : 0),
    flinks: result.data,
  });
});

router.put('/:id', (req, res) => {
  let companyId, dbsIdx;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    companyId = req.query.companyId;
    dbsIdx = req.query.dbsIdx;
  } else {
    if (!req.session.user.admin) {
      return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
    }
    companyId = req.session.user.companyId;
    dbsIdx = req.session.user.dbsIdx;
  }

  // Multipart Form
  if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let id = db.escape(req.params.id);
  let result = await(getURLById(dbsIdx, companyId, id));
  if(result.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }
  
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let desc = db.escape(fields.desc);
    let url = db.escape(fields.url);
    if(desc.length > 33 || url.length > 257) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }

    let qStr = 'UPDATE `' + db.TB_FLINK + '` SET `desc` = \'' + desc + '\',`url` = \'' + url + '\' WHERE `id` = \'' + id + '\' AND `companyId` = \'' + companyId + '\';';
    result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    } 
    await(audit.log(req.session.user, audit.ADTCODE.EDIT_FLINK, {'desc': desc}));
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }));
});

router.post('/', (req, res) => {
  let companyId, dbsIdx;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    dbsIdx = req.query.dbsIdx;
    companyId = req.query.companyId;
  } else {
    if (!req.session.user.admin) {
      return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
    }
    dbsIdx = req.session.user.dbsIdx;
    companyId = req.session.user.companyId;
  }

  // Multipart Form
  if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.staus(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let MAX_FILE_LINK = await(csid.get('C','MAX_FILE_LINK','int'));
  let qStr = 'SELECT COUNT(`id`) AS `total` FROM `' + db.TB_FLINK + '` WHERE `companyId` = ' + companyId + ';' ;
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(parseInt(result.data[0].total) >= MAX_FILE_LINK) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.MAX_FILE_LINK});
  }
  
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let desc = db.escape(fields.desc);
    let url = db.escape(fields.url);
    if(desc.length > 33 || url.length > 257) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }

    let qStr = 'INSERT INTO `' + db.TB_FLINK + '` (`companyId`,`desc`,`url`) VALUES (\'' + companyId + '\',\'' + desc + '\',\'' + url + '\');';
    result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) { // success
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }
    await(audit.log(req.session.user, audit.ADTCODE.NEW_FLINK, {'desc': desc}));
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }));
});

router.delete('/:id', (req, res) => {
  let companyId, dbsIdx;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    dbsIdx = req.query.dbsIdx;
    companyId = req.query.companyId;
  } else {
    if (!req.session.user.admin) {
      return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
    }
    dbsIdx = req.session.user.dbsIdx;
    companyId = req.session.user.companyId;
  }

  let id = db.escape(req.params.id);
  let result = await(getURLById(dbsIdx, companyId, id));
  if(result.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }

  let desc = result.data.desc;
  let qStr = 'DELETE FROM `' + db.TB_FLINK  + '` WHERE `id` = \'' + id + '\' AND `companyId` = \'' + companyId + '\';' ;
  result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  
  await(audit.log(req.session.user, audit.ADTCODE.DELETE_FLINK, {'desc': desc}));
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

module.exports = router;
