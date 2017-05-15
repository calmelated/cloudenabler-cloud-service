const express = require('express');
const router = express.Router();
const prj = require('../project');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const csid = require(prj.LIB_PATH + '/csid');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');

/* GET users listing. */
router.get('/', (req, res) => {
  if (!req.session.user.admin) {
    return res.redirect('/');
  }
});

router.get('/[c,s]', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let resp = {};
  let dbName = req.path.split('/')[1];
  let keys = Object.keys(req.query);
  for (let i = 0; i < keys.length; i++) {
    resp[keys[i]] = csid.get(dbName, keys[i]);
  }
  return res.send(await(resp));
});

router.put('/[c,s]', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  if (!req.body) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_CMD});
  }
  let querys = [];
  let dbName = req.path.split('/')[1];
  let keys = Object.keys(req.body);
  for (let i = 0; i < keys.length; i++) {
    querys[i] = csid.set(dbName, keys[i], req.body[keys[i]]);
  }
  await(querys);
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

router.get('/[c,s,m]/dump', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let dbName = req.path.split('/')[1];
  let result = await(csid.getAll(dbName));
  if (result.err) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: result.err});
  }
  let resp = {};
  for (let i = 0; i < result.data.length; i++) {
    resp[result.data[i].key] = result.data[i].value;
  }
  return res.send(resp);
});

router.get('/[c,s]/reset|sync', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({
      desc: gstate.NO_PERMISSION
    });
  }
  let dbName = req.path.split('/')[1];
  let forceClean = (req.path.match('/[c,s]/reset')) ? true : false;
  // console.log(dbName + ', ' + forceClean);
  let result = await(csid.sync(dbName, forceClean));
  return res.send(result);
});

module.exports = router;
