const express = require('express');
const router = express.Router();
const prj = require('../project');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const utils = require(prj.LIB_PATH + '/utils');
const sessionStore = require(prj.LIB_PATH + '/session');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const async = require('asyncawait/async');
const await = require('asyncawait/await');

router.get('/', (req, res) => {
  let result = await(sessionStore.getAll());
  if(result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  return res.status(gstate.RC_OK).send(result.data);
});

router.get('/:sid', (req, res) => {
  let dbsIdx = req.query.dbsIdx ? parseInt(db.escape(req.query.dbsIdx)) : -1;
  if(isNaN(dbsIdx)) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let sid = db.escape(req.params.sid);
  let sidInfo = await(sessionStore.get(sid));
  if(sidInfo.err) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: sidInfo.err});
  }
  
  let data = utils.toJson(sidInfo.data, {__file, __line});
  if(data.user) {
    delete data.user.password;
  }
  return res.status(gstate.RC_OK).send({
    session: sidInfo.session,
    expires: sidInfo.expires,
    // cookie: data.cookie,
    user: data.user
  });
});

router.delete('/:session', (req, res) => {
  let dbsIdx = req.query.dbsIdx ? parseInt(db.escape(req.query.dbsIdx)) : -1;
  if(isNaN(dbsIdx)) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let session = db.escape(req.params.session);
  let result = await(sessionStore.clear(session)); 
  if(result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else {
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }
});

router.delete('/', (req, res) => {
  let dbsIdx = req.query.dbsIdx ? parseInt(db.escape(req.query.dbsIdx)) : -1;
  if(isNaN(dbsIdx)) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let result = await(sessionStore.clear(null));
  if(result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else {
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }
});

module.exports = router;
