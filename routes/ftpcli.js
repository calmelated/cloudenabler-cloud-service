const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const prj = require('../project');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const csid = require(prj.LIB_PATH + '/csid');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const FtpCli = require('ftp');

router.get('/', (req, res) => {
  if (!req.session.trustable && !req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({
      desc: gstate.NO_PERMISSION
    });
  }
  // read default settings from db
  let [_host, _port, _user, _pswd, _dfile] = await([
    csid.get('C','FTP_CLI_HOST'),
    csid.get('C','FTP_CLI_PORT','int'),
    csid.get('C','FTP_CLI_USER'),
    csid.get('C','FTP_CLI_PSWD'),
    csid.get('C','BAKLOG_FTP_DEST_DIR'),
  ]);

  // read settings from query
  let host = (req.query.host) ? db.escape(req.query.host) : _host ;
  let port = (req.query.port) ? parseInt(db.escape(req.query.port)) : _port ;
  let user = (req.query.user) ? db.escape(req.query.user) : _user ;
  let pswd = (req.query.pswd) ? db.escape(req.query.pswd) : _pswd ;

  let sfile = db.escape(req.query.sfile);
  if (!fs.existsSync(sfile)) {
    return res.status(gstate.RC_BAD_REQUEST).send({
      desc: gstate.NO_FILE,
    });
  }

  let dfile = db.escape(req.query.dfile);
  if(!dfile) {
    dfile = _dfile;
    if(dfile) {
      dfile =  dfile + '/' + path.basename(sfile);
    } else {
      dfile =  path.basename(sfile);
    }
  }
  dbg('Final FTP destionation dir: ' + dfile);

  let ftpCli = new FtpCli();
  ftpCli.connect({
    host: host,
    port: port,
    user: user,
    password: pswd,
    // connTimeout: 10000,
    // pasvTimeout: 10000,
    // keepalive: 10000,
  });

  let errMsg = '';
  ftpCli.on('ready', () => {
    ftpCli.put(sfile, dfile, (err) => {
      if (err) {
        info(__file + ':' + __line + ' ' + err);
        errMsg = err.toString();
      }
      ftpCli.end();
    });
  });

  ftpCli.on('error', (err) => {
    dbg(__file + ':' + __line + ' ' + err);
    errMsg = err;
    ftpCli.end();
  });

  ftpCli.on('close', (hasErr) => {
    if(hasErr || errMsg) {
      return res.status(gstate.RC_INTERNAL_ERR).send({
        desc: errMsg,
      });
    } else {
      return res.status(gstate.RC_OK).send({
        desc: gstate.OK,
      });
    }
  });
});

module.exports = router;
