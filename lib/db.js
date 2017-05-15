const express = require('express');
const prj = require('../project');
const fs = require('fs');
const md5 = require(prj.LIB_PATH + '/pswd').md5;
const asyncUtils = require('async');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');
const mysql = require('mysql');
const gstate = require(prj.GSTATE_PATH);
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const csid = require(prj.LIB_PATH + '/csid');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const device = require(prj.LIB_PATH + '/device');
const iotype = require(prj.ROOT_PATH + '/public/js/iotype');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;

module.exports.DB_MMC = 'dlog_mmc';
module.exports.DB_RLOG = 'rlog';
module.exports.TB_CONFIG = 'config';
module.exports.TB_STATUS = 'status';
module.exports.TB_MCACHE = 'mcache';
module.exports.TB_USER = 'user';
module.exports.TB_DEVICE = 'device';
module.exports.TB_DEVICE_AUTH = 'device_auth';
module.exports.TB_COMPANY = 'company';
module.exports.TB_EVTLOG = 'evtlog';
module.exports.TB_SESSION = 'sessions';
module.exports.TB_ALARM_LOG = 'alarm_log';
module.exports.TB_AUDIT_LOG = 'audit_log';
module.exports.TB_IOSTAT_LOG = 'iostat_log';
module.exports.TB_ANNOUNCE_LIST = 'announce_list';
module.exports.TB_FLINK = 'flink';
module.exports.TB_GROUP = 'group';
module.exports.TB_ADVGP_HDR = 'advgp_hdr';
module.exports.TB_ADVGP_MBR = 'advgp_mbr';
module.exports.TB_IOSW = 'iosw';
module.exports.TB_JOB_QUEUE = 'job_queue';

//------------------------------------------------------
// Init MySQL Pool
//------------------------------------------------------
const pr_getDBConn = (dbPool) => {
  return new Promise((resolve, reject) => {
    if(!dbPool || !dbPool.CONN) {
      return resolve({err: 'dbPool is null!'});
    }
    dbPool.CONN.getConnection((err, conn) => {
      resolve({err, conn});
    });
  });
};

// Re-election (0 -> 1 -> 2)
const nextWrIdx = (dbs) => {
  let idx = -1;
  for(let i = 0; i < dbs.POOLS.length; i++) {
    if(dbs.POOLS[i].STAT) {
      idx = i;
      break;
    }
  }
  if(idx > 0) {
    dbg('nextWrIdx -> wrIdx to ' + idx);
    dbs.WIDX = idx;
  }
};

const chkDBPools = (isMaster = false) => {
  let qStat = 'SELECT `VARIABLE_NAME`,`VARIABLE_VALUE` FROM `information_schema`.`GLOBAL_STATUS` where `VARIABLE_NAME` = \'WSREP_CLUSTER_SIZE\'';
  qStat += 'UNION SELECT `VARIABLE_NAME`,`VARIABLE_VALUE` FROM `information_schema`.`GLOBAL_STATUS` where `VARIABLE_NAME` = \'WSREP_THREAD_COUNT\'';
  qStat += 'UNION SELECT `VARIABLE_NAME`,`VARIABLE_VALUE` FROM `information_schema`.`GLOBAL_STATUS` where `VARIABLE_NAME` = \'WSREP_CONNECTED\'';
  qStat += 'UNION SELECT `VARIABLE_NAME`,`VARIABLE_VALUE` FROM `information_schema`.`GLOBAL_STATUS` where `VARIABLE_NAME` = \'OPEN_FILES\'';
  qStat += 'UNION SELECT `VARIABLE_NAME`,`VARIABLE_VALUE` FROM `information_schema`.`GLOBAL_STATUS` where `VARIABLE_NAME` = \'DELAYED_INSERT_THREADS\'';
  qStat += 'UNION SELECT `VARIABLE_NAME`,`VARIABLE_VALUE` FROM `information_schema`.`GLOBAL_STATUS` where `VARIABLE_NAME` = \'MAX_USED_CONNECTIONS\'';
  qStat += 'UNION SELECT `VARIABLE_NAME`,`VARIABLE_VALUE` FROM `information_schema`.`GLOBAL_STATUS` where `VARIABLE_NAME` like \'THREADS_%\'';
  qStat += 'UNION SELECT `VARIABLE_NAME`,`VARIABLE_VALUE` FROM `information_schema`.`GLOBAL_STATUS` where `VARIABLE_NAME` like \'INNODB_ROW_LOCK_%\'';

  for(let i = 0; i < prj.DBS.length; i++) {
    for(let j = 0; j < prj.DBS[i].POOLS.length; j++) {
      let dbPool = prj.DBS[i].POOLS[j];
      if(!dbPool.CONN) {
        dbPool.CONN = mysql.createPool({
          host: dbPool.ADDR,
          port: dbPool.PORT,
          user: dbPool.USER,
          password: dbPool.PSWD,
          socketPath: dbPool.SOCK,
          multipleStatements: true,
          connectionLimit: (isMaster) ? 1 : prj.DB_POOL_SZ,
          // acquireTimeout: 30000,
          waitForConnections: true,
          database: module.exports.DB_MMC,
        });
      }
      let result = await(pr_getDBConn(dbPool));
      if(result.err || !result.conn) {
        if(!dbPool.STAT) {
          return;
        }
        info('[Error] Database ' + dbPool.ADDR + ' is offline!');
        dbPool.STAT = false;
        nextWrIdx(prj.DBS[i]);
      } else {
        result.conn.query(qStat, (err, rows) => {
          if(err) {
            return dbg(err);
          } else if(dbPool.STAT) {
            return;
          }
          info('Database ' + dbPool.ADDR + ' is online!');
          dbPool.STAT = true;
          nextWrIdx(prj.DBS[i]);
          for(let i = 0; i < rows.length; i++) {
            dbPool[rows[i].VARIABLE_NAME] = rows[i].VARIABLE_VALUE;
          }
        });
        result.conn.release();
      }
    }
  }
};
module.exports.chkDBPools = chkDBPools;

const escape = (str) => {
  if (typeof str === 'undefined') {
    return '';
  } else if(utils.matchAttackStr(str)) {
    return '';
  } else if(typeof str === 'number') {
    return str.toString();
  }
  return str.replace(/[\0\x08\x09\x1a\n\r"'\\]/g, (char) => {
    switch (char) {
      case "\x08":
        return "\\b";
      case "\x09":
        return "\\t";
      case "\x1a":
        return "\\z";
      case "\0":
      case "\n":
      case "\r":
        return "";
      case "\"":
      case "'":
      case "\\":
        return "\\" + char; // prepends a backslash to backslash, percent, and double/single quotes
    }
  });
};
module.exports.escape = escape;

const escapes = (obj) => {
  if(!obj) {
    return;
  }
  let keys = Object.keys(obj);
  for(let i = 0; i < keys.length; i++) {
    if(keys[i].match(/[ab][0-2]/i)) {
      continue;
    } else if(typeof obj[keys[i]] !== 'string') {
      return info('Invlid body string [' + keys[i] + ']: ' + obj[keys[i]]);
    }
    obj[keys[i]] = escape(obj[keys[i]]);
  }
};
module.exports.escapes = escapes;

// Single query
const squery = (opts, qStr) => {
  return new Promise((resolve, reject) => {
    let dbConn = mysql.createConnection(opts);
    dbConn.query(qStr, (err, rows) => {
      dbConn.end();
      if(err) {
        console.warn(err);
        return resolve({
          status: gstate.DB_ERROR,
          err: err
        });
      }
      return resolve({
        status: gstate.OK,
        data: rows
      });
    });
  });
};
module.exports.squery = squery;

const getDBconn = (idx, readOnly, callback) => {
  if(!prj.DBS[idx]) {
    info('getDBconn(): invalid db idx = ' + idx);
    return callback({err: 'invalid db idx = ' + idx});
  }

  let dbPool = prj.DBS[idx].POOLS;
  let szPool = dbPool.length;
  if(readOnly) {
    let rndIdx = parseInt(Math.random() * szPool);
    rndIdx = (rndIdx === prj.DBS[idx].WIDX) ? parseInt(Math.random() * szPool) : rndIdx; // split loading to other dbs
    if(dbPool[rndIdx]) {
      let result = await(pr_getDBConn(dbPool[rndIdx]));
      if(!result.err) {
        // dbg('1. db-read idx = ' + rndIdx);
        dbPool[rndIdx].STAT = true;
        return callback(null, result.conn);
      }
      dbPool[rndIdx].STAT = false;
    } else {
      info('unknown db rndIdx = ' + rndIdx);
    }

    // Re-eletion (2 -> 1 -> 0)
    for(let i = szPool - 1; i >= 0; i--) {
      if(!dbPool[i].STAT) {
        continue;
      }
      let result = await(pr_getDBConn(dbPool[i]));
      if(result.err) {
        dbPool[rndIdx].STAT = false;
        continue;
      }
      // dbg('2. db-read idx = ' + i);
      return callback(null, result.conn);
    }
    return callback({err: 'No availalbe read database! idx = ' + idx});
  } else { // write query
    let result = await(pr_getDBConn(dbPool[prj.DBS[idx].WIDX]));
    if(!result.err) {
      if(prj.DBS[idx].WIDX !== 0 && dbPool[0].STAT) {
        dbg('Switch to database ' + prj.DBS[idx].WIDX);
        prj.DBS[idx].WIDX = 0; // first db is back
      }
      // dbg('3. db-write idx = ' + prj.DBS[idx].WIDX);
      return callback(null, result.conn);
    }
    // Re-election (0 -> 1 -> 2)
    for(let i = 0; i < szPool; i++) {
      let result = await(pr_getDBConn(dbPool[i]));
      if(result.err) {
        dbPool[i].STAT = false;
        continue;
      }
      prj.DBS[idx].WIDX = i;
      // dbg('4. db-write idx = ' + prj.DBS[idx].WIDX);
      return callback(null, result.conn);
    }
    return callback({err: 'No availalbe write database! idx = ' + idx});
  }
};

const doQuery = (dbsIdx, readOnly, qStr, extra, callback) => {
  if(!callback) {
    callback = extra;
    extra = null;
  }
  if(typeof dbsIdx === 'undefined' || dbsIdx === null) {
    throw 'Undefined dbsIdx, DB query: ' + qStr;
  }
  if(!qStr.match(/^SELECT/i)) {
    dbg('DB-' + dbsIdx + ', '+ qStr);
  }
  getDBconn(dbsIdx, readOnly, (err, conn) => {
    if(err || !conn) {
      if(typeof err === 'object') {
        console.warn(__file + ' ' + __line);
        console.dir(err);
      } else {
        console.warn(__file + ' ' + __line + ' ' + err);
      }
      return callback({status: gstate.DB_ERROR, err: err});
    }
    let error, result = [];
    let query = (extra !== null) ? conn.query(qStr, [extra]) : conn.query(qStr);
    conn.release();
    query.on('error', (err) => {
      console.log('Code: \x1b[35m' + err.code + '\x1b[0m, dbsIdx: \x1b[35m' + dbsIdx + '\x1b[0m, Query => \x1b[33m' + qStr + '\x1b[0m');
      error = {
        status: gstate.DB_ERROR,
        qStr: qStr,
        err: err,
      };
    }).on('fields', (fields) => {
      // ddbg(fields);
    }).on('result', (row) => {
      // ddbg(row);
      result.push(row);
    }).on('end', (info) => {
      if(error) {
        return callback(error);
      } else {
        return callback({status: gstate.OK, data: result});
      }
    });
  });
};

// Pool query (Write)
const wquery = (dbsIdx, qStr, extra, callback) => {
  if(!callback) { // function overloading
    callback = extra;
    extra = null;
  }
  if(!qStr) {
    console.log('[Warning] Empty query => ' + qStr);
    return callback({status: gstate.DB_ERROR, err: 'Empty query!'});
  }
  let doTrans = true;
  qStr = (doTrans) ? 'BEGIN;' + qStr + 'COMMIT;' : qStr ;
  doQuery(dbsIdx, false, qStr, extra, (result) => {
    if(result.status === gstate.OK) {
      if(doTrans) {
        result.data.shift();
        result.data.pop();
      }
      return callback(result);
    }
    // Retry if Deadlock
    if(result.err && (result.err.code && result.err.code.match(/ER_LOCK_DEADLOCK|ER_UNKNOWN_COM_ERROR|ER_LOCK_WAIT_TIMEOUT/i))) {
      console.log('Retry query #1 => ' + qStr);
      doQuery(dbsIdx, false, qStr, extra, (result) => {
        if(result.err && (result.err.code && result.err.code.match(/ER_LOCK_DEADLOCK|ER_UNKNOWN_COM_ERROR|ER_LOCK_WAIT_TIMEOUT/i))) {
          setTimeout(() => {
            console.log('Retry query #2, after 100ms => ' + qStr);
            return doQuery(dbsIdx, false, qStr, extra, (result) => {
              if(result.err) {
                return callback(result);
              } else if(doTrans) {
                result.data.shift();
                result.data.pop();
              }
              return callback(result);
            });
          }, 100);
        } else {
          if(doTrans) {
            result.data.shift();
            result.data.pop();
          }
          return callback(result);
        }
      });
    } else {
      return callback(result);
    }
  });
};
module.exports.wquery = wquery;

// Pool query (Read)
const query = (dbsIdx, qStr, callback) => {
  if(!qStr) {
    info({__file, __line, err: '[Warning] Empty query => ' + qStr});
    return callback({status: gstate.DB_ERROR, err: 'Empty query!'});
  }
  doQuery(dbsIdx, true, qStr, (result) => {
    return callback(result);
  });
};
module.exports.query = query;

// Pool query (Read)
const pr_query = (dbsIdx, qStr) => {
  return new Promise((resolve, reject) => {
    if(!qStr) {
      console.log('[Warning] Empty query => ' + qStr);
      return resolve({status: gstate.DB_ERROR, err: 'Empty query!'});
    }
    doQuery(dbsIdx, true, qStr, (result) => {
      return resolve(result);
    });
  });
};
module.exports.pr_query = pr_query;

// Pool query (Write)
const pr_wquery = (dbsIdx, qStr, extra) => {
  extra = extra ? extra : null;
  return new Promise((resolve, reject) => {
    wquery(dbsIdx, qStr, extra, (result) => {
      return resolve(result);
    });
  });
};
module.exports.pr_wquery = pr_wquery;

const initDB = () => {
  let dbName = module.exports.DB_MMC;
  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = 'BEGIN;CREATE DATABASE IF NOT EXISTS `' + dbName + '` DEFAULT CHARACTER SET utf8 COLLATE utf8_unicode_ci; COMMIT;';
    let result = await(squery({
      host: prj.DBS[i].POOLS[0].ADDR,
      port: prj.DBS[i].POOLS[0].PORT,
      user: prj.DBS[i].POOLS[0].USER,
      password: prj.DBS[i].POOLS[0].PSWD,
      socketPath: prj.DBS[i].POOLS[0].SOCK,
      multipleStatements: true,
    }, qStr));
    if (result.err) {
      dbg({__file, __line, err: result.err});
    }
  }

  // Init Pool for Master
  await(chkDBPools(true));

  for(let i = 0; i < prj.DBS.length; i++) {
    let qStr = 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_CONFIG + '` (' +
      '`time`  BIGINT UNSIGNED NOT NULL,' +
      '`type`  TINYINT         NOT NULL DEFAULT 0,'   +
      '`key`   VARCHAR(32)     NOT NULL PRIMARY KEY,' +
      '`value` VARCHAR(512)    NOT NULL,' +
      'INDEX(`time`)' +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_STATUS + '` (' +
      '`time`  BIGINT UNSIGNED NOT NULL,' +
      '`type`  TINYINT         NOT NULL DEFAULT 0,'   +
      '`key`   VARCHAR(32)     NOT NULL PRIMARY KEY,' +
      '`value` VARCHAR(512)    NOT NULL,' +
      'INDEX(`time`)' +
      ') ENGINE=Memory COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_COMPANY + '` (' +
      '`id`            BIGINT UNSIGNED    NOT NULL,' +
      '`parentId`      BIGINT UNSIGNED,            ' +
      '`createTime`    INT UNSIGNED       NOT NULL,' +
      '`company`       VARCHAR(64)        NOT NULL,' +
      '`agent`         VARCHAR(64),                ' +
      '`numAlarm`      SMALLINT           NOT NULL DEFAULT 0,' +
      '`extra`         VARCHAR(4096),              ' +
      'PRIMARY KEY(`id`),' +
      'UNIQUE(`company`),' +
      'INDEX(`parentId`)'  +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_USER + '` (' +
      '`id`            INT UNSIGNED       NOT NULL AUTO_INCREMENT,'+
      '`createTime`    INT UNSIGNED       NOT NULL,' +
      '`companyId`     BIGINT UNSIGNED    NOT NULL,' +
      '`name`          VARCHAR(64)        NOT NULL,' +
      '`account`       VARCHAR(64)        NOT NULL,' +
      '`password`      VARCHAR(64)        NOT NULL,' +
      '`bakpass`       VARCHAR(64)        NOT NULL,' +
      '`lang`          VARCHAR(8)         NOT NULL,' +
      '`admin`         BOOLEAN            NOT NULL DEFAULT FALSE,' +
      '`admCtrl`       BOOLEAN            NOT NULL DEFAULT FALSE,' +
      '`trial`         BOOLEAN            NOT NULL DEFAULT FALSE,' +
      '`activate`      BOOLEAN            NOT NULL DEFAULT FALSE,' +
      '`allowDown`     BOOLEAN            NOT NULL DEFAULT FALSE,' +
      '`allowUp`       BOOLEAN            NOT NULL DEFAULT FALSE,' +
      '`pushType`      TINYINT            NOT NULL DEFAULT 0,' +
      '`gcmId`         VARCHAR(256),'  +
      'PRIMARY KEY(`id`,`companyId`),' +
      'UNIQUE(`companyId`,`account`)'  +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_GROUP + '` (' +
      '`companyId`     BIGINT UNSIGNED    NOT NULL,' +
      '`name`          VARCHAR(64)        NOT NULL,' +
      '`sn`            BINARY(6)          NOT NULL,' +
      '`addr`          VARCHAR(32)        NOT NULL,' +
      'INDEX(`companyId`,`name`)' +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_ADVGP_MBR + '` (' +
      '`id`            INT UNSIGNED       NOT NULL,' +
      '`companyId`     BIGINT UNSIGNED    NOT NULL,' +
      '`sn`            BINARY(6)          NOT NULL,' +
      '`addr`          VARCHAR(32)        NOT NULL,' +
      'PRIMARY KEY(`companyId`,`id`,`sn`,`addr`)' +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_ADVGP_HDR + '` (' +
      '`id`            INT UNSIGNED       NOT NULL AUTO_INCREMENT,' +
      '`companyId`     BIGINT UNSIGNED    NOT NULL,' +
      '`parentId`      INT UNSIGNED       NOT NULL DEFAULT 0,' +
      '`name`          VARCHAR(64)        NOT NULL,' +
      '`config`        VARCHAR(4096)      NOT NULL,' +
      'PRIMARY KEY(`id`,`companyId`),' +
      'INDEX(`companyId`,`parentId`)' +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_DEVICE + '` (' +
      '`id`            INT UNSIGNED       NOT NULL AUTO_INCREMENT,'   +
      '`createTime`    INT UNSIGNED       NOT NULL,'                  +
      '`companyId`     BIGINT UNSIGNED    NOT NULL,'                  +
      '`sn`            BINARY(6)          NOT NULL,'                  +
      '`name`          VARCHAR(64)        NOT NULL,'                  +
      '`mo`            VARCHAR(16)        NOT NULL,'                  +
      '`password`      VARCHAR(64),'                                  + // FTP server password
      '`enAlarm`       BOOLEAN            NOT NULL DEFAULT FALSE,'    +
      '`enControl`     BOOLEAN            NOT NULL DEFAULT FALSE,'    +
      '`enMonitor`     BOOLEAN            NOT NULL DEFAULT FALSE,'    +
      '`enLog`         BOOLEAN            NOT NULL DEFAULT FALSE,'    +
      '`enServLog`     BOOLEAN            NOT NULL DEFAULT FALSE,'    +
      '`pollTime`      SMALLINT UNSIGNED,'                            +
      '`tzone`         SMALLINT UNSIGNED,'                            +
      '`daylight`      SMALLINT UNSIGNED,'                            +
      '`mbusTimeout`   SMALLINT UNSIGNED  DEFAULT 30,'                +
      '`fixPoint`      SMALLINT UNSIGNED  DEFAULT 10,'                +
      '`storCapacity`  SMALLINT UNSIGNED  DEFAULT 80,'                + // Storage capacity (80% - 100%)
      '`enFtpCli`      BOOLEAN            NOT NULL DEFAULT FALSE,'    +
      '`ftpCliHost`    VARCHAR(64)        NOT NULL,'                  + // FTP cli: host
      '`ftpCliPort`    INT UNSIGNED       DEFAULT 21,'                + // FTP cli: port
      '`ftpCliAccount` VARCHAR(32)        NOT NULL,'                  + // FTP cli: account
      '`ftpCliPswd`    VARCHAR(32)        NOT NULL,'                  + // FTP cli: password
      '`modbus`        MEDIUMTEXT         NOT NULL,'                  +
      '`extra`         VARCHAR(4096)      NOT NULL,'                  + // Extra Messages
      '`mstConf`       VARCHAR(4096)      NOT NULL,'                  + // Master Config
      'PRIMARY KEY(`id`,`companyId`),'                                +
      'UNIQUE(`companyId`,`sn`)'                                      +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_DEVICE_AUTH + '` (' +
      '`companyId`    BIGINT UNSIGNED     NOT NULL,' +
      '`deviceId`     INT UNSIGNED        NOT NULL,' +
      '`memberId`     INT UNSIGNED        NOT NULL,' +
      '`enAlarm`      BOOLEAN             NOT NULL DEFAULT FALSE,' +
      '`enControl`    BOOLEAN             NOT NULL DEFAULT FALSE,' +
      '`enMonitor`    BOOLEAN             NOT NULL DEFAULT FALSE,' +
      'UNIQUE(`companyId`,`deviceId`,`memberId`)' +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_ALARM_LOG + '` (' +
      '`id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,'   +
      '`time`         INT UNSIGNED NOT NULL,'+
      '`companyId`    BIGINT UNSIGNED     ,' +
      '`account`      VARCHAR(64)         ,' +
      '`status`       TINYINT             ,' +
      '`msgCode`      TINYINT             ,' +
      '`priority`     TINYINT(1) DEFAULT 0,' +
      '`sn`           BINARY(6)           ,' +
      '`addr`         MEDIUMINT UNSIGNED  ,' +
      '`done`         TINYINT(1) DEFAULT 0,' +
      '`message`      VARCHAR(1024)       ,' +
      '`extra`        VARCHAR(4096)       ,' +
      'PRIMARY KEY(`id`),'                   +
      'INDEX(`companyId`,`time`)'            +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_AUDIT_LOG + '` (' +
      '`time`         INT UNSIGNED NOT NULL,'+
      '`companyId`    BIGINT UNSIGNED     ,' +
      '`account`      VARCHAR(64)         ,' +
      '`msgCode`      TINYINT             ,' +
      '`message`      VARCHAR(1024)       ,' +
      'INDEX(`companyId`,`time`)'           +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_IOSTAT_LOG + '` (' +
      '`time`         INT UNSIGNED NOT NULL,'+
      '`companyId`    BIGINT UNSIGNED     ,' +
      '`sn`           BINARY(6)           ,' +
      '`addr`         MEDIUMINT UNSIGNED  ,' +
      '`account`      VARCHAR(64)         ,' +
      '`regName`      VARCHAR(64)         ,' +
      '`msgCode`      TINYINT             ,' +
      '`accNum`       INT UNSIGNED NOT NULL DEFAULT 0,'+
      '`accTime`      INT UNSIGNED NOT NULL DEFAULT 0,'+
      'INDEX(`time`,`companyId`,`sn`,`addr`)'  +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_ANNOUNCE_LIST + '` (' +
      '`time`         INT UNSIGNED NOT NULL,'+
      '`companyId`    BIGINT UNSIGNED      ,'+
      '`message`      VARCHAR(1024)        ,'+
      'PRIMARY KEY(`time`,`companyId`)'     +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_FLINK + '` (' +
      '`id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,' +
      '`companyId`    BIGINT UNSIGNED,' +
      '`desc`         VARCHAR(64),'  +
      '`url`          VARCHAR(256),' +
      'PRIMARY KEY(`id`)'  +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_IOSW + '` (' +
      '`sn`     BINARY(6)  NOT NULL,' +
      '`addr`   MEDIUMINT  UNSIGNED,' +
      '`swSn`   BINARY(6)  NOT NULL,' +
      '`swAddr` MEDIUMINT  UNSIGNED,' +
      'PRIMARY KEY(`sn`,`addr`)' +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + dbName + '`.`' + module.exports.TB_JOB_QUEUE + '` (' +
      '`id`           INT UNSIGNED NOT NULL,' +
      '`host`         VARCHAR(32)  NOT NULL,' +
      '`status`       TINYINT UNSIGNED NOT NULL DEFAULT 0,' +
      '`execTime`     INT UNSIGNED NOT NULL,'+
      '`task`         MEDIUMTEXT,'  +
      'PRIMARY KEY(`id`)'  +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    await(pr_wquery(i, qStr));
  }

  // Setup Super Admin
  let qStr = 'INSERT IGNORE INTO `' + module.exports.TB_COMPANY + '` (`id`,`parentId`,`createTime`,`company`) VALUES (28398895, 0, UNIX_TIMESTAMP(now()),' + '\'KSMT Microtech\');';
  qStr += 'INSERT IGNORE INTO `' + module.exports.TB_USER    + '` (`createTime`,`companyId`,`account`,`name`,`password`,`admin`) VALUES (UNIX_TIMESTAMP(now()), 28398895, \'kdebug@ksmt.com.tw\', \'Admin\', \'' + md5('Ksmt28398895kdebug@ksmt.com.tw') + '\', 1);';
  await(pr_wquery(0, qStr));
  return null;
};
module.exports.initDB = initDB;

const createLogTable = (dbsIdx, sn, addr, mbObj) => {
  let type = mbObj.type;
  if(!iotype.enCloudLogging(type)) {
    return {err: 'Cloud Logging is disabled!'};
  }

  let dataType;
  if(iotype.isIEEE754(type)) { //IEE754
    dataType = 'FLOAT NOT NULL';
  } else if(iotype.is32bit(type) || iotype.is48bit(type)) {
    if(iotype.isSigned(type)) { // 32bits int/fpt
      dataType = 'INT NOT NULL';
    } else { // 32bits unsigned int, 48 bits unfpt
      dataType = 'INT UNSIGNED NOT NULL';
    }
  } else if(iotype.is64bit(type)) {
    if(iotype.isSigned(type)) { // 64bits int
      dataType = 'BIGINT NOT NULL';
    } else { // 64bits unsigned int
      dataType = 'BIGINT UNSIGNED NOT NULL';
    }        
  } else { // 16 bits
    if(iotype.isBinary(type)) { // binary
      dataType = 'BINARY(16) NOT NULL';
    } else if(iotype.isSigned(type)) { // 16bits int, fpt16
      dataType = 'SMALLINT NOT NULL';
    } else { // 16bits unsigned int, Alarm, Btn, Switch
      dataType = 'SMALLINT UNSIGNED NOT NULL';
    }
  }
  if(!dataType) {
    return {err: 'Unknown dataType!'};
  }

  // things to record
  let recCols;
  if(iotype.isEventData(type)) {
    recCols = ',`value` ' + dataType;
  } else {
    recCols = ',`value` ' + dataType + ', `max` ' + dataType + ', `min` ' + dataType;
  }

  let qStr  = 'CREATE DATABASE IF NOT EXISTS `' + module.exports.DB_RLOG + '_' + sn + '` DEFAULT CHARACTER SET utf8 COLLATE utf8_unicode_ci;';
  qStr += 'CREATE TABLE IF NOT EXISTS `' + module.exports.DB_RLOG + '_' + sn + '`.`' + addr + '_raw`   (`time` INT UNSIGNED NOT NULL, `value` ' + dataType + ', PRIMARY KEY(`time`)) ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';
  qStr += 'CREATE TABLE IF NOT EXISTS `' + module.exports.DB_RLOG + '_' + sn + '`.`' + addr + '_day`   (`time` INT UNSIGNED NOT NULL' + recCols + ', PRIMARY KEY(`time`)) ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';
  qStr += 'CREATE TABLE IF NOT EXISTS `' + module.exports.DB_RLOG + '_' + sn + '`.`' + addr + '_month` (`time` INT UNSIGNED NOT NULL' + recCols + ', PRIMARY KEY(`time`)) ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';
  qStr += 'CREATE TABLE IF NOT EXISTS `' + module.exports.DB_RLOG + '_' + sn + '`.`' + addr + '_year`  (`time` INT UNSIGNED NOT NULL' + recCols + ', PRIMARY KEY(`time`)) ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

  // Execute query
  let result = await(pr_wquery(dbsIdx, qStr));
  if (result.err) { dbg({__file, __line, err: result.err}); }
  return result;
};
module.exports.createLogTable = createLogTable;

const deleteLogTable = (dbsIdx, sn, addr) => {
  let qStr = 'DROP TABLE IF EXISTS ';
  qStr += '`' + module.exports.DB_RLOG + '_' + sn + '`.`' + addr + '_raw`,';
  qStr += '`' + module.exports.DB_RLOG + '_' + sn + '`.`' + addr + '_day`,';
  qStr += '`' + module.exports.DB_RLOG + '_' + sn + '`.`' + addr + '_month`,';
  qStr += '`' + module.exports.DB_RLOG + '_' + sn + '`.`' + addr + '_year`;';

  let result = await(pr_wquery(dbsIdx, qStr));
  if (result.err) { dbg({__file, __line, err: result.err}); }
  return result;
};
module.exports.deleteLogTable = deleteLogTable;
