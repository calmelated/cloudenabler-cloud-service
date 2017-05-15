const os = require('os');
const fs = require('fs');
const prj = {};
const inDocker = (fs.existsSync('/var/run/indocker') || fs.existsSync('/.dockerenv')) ? true : false;
const inLinode = (fs.existsSync('/root/.ssh/linode.pem') || fs.existsSync('/etc/network/.interfaces.linode-last')) ? true : false ;
const inCiServ = (fs.existsSync('./.ci-server') || fs.existsSync('/poseidon/.ci-server')) ? true : false;
let hostname = os.hostname();

prj.IN_DOCKER = inDocker;
prj.DEBUG_MODE = (process.env.DEBUG_MODE) ? true : false;
prj.ROOT_PATH = __dirname ;
prj.NODE = process.execPath;
prj.BIN_PATH = prj.ROOT_PATH + '/bin';
prj.CSID = prj.BIN_PATH + '/csid';
prj.LIB_PATH = prj.ROOT_PATH + '/lib';
prj.ROUTES_PATH = prj.ROOT_PATH + '/routes';
prj.UPLOAD_PATH = prj.ROOT_PATH + '/uploads';
prj.CUR_CSID = prj.ROOT_PATH + '/.csid.json';
prj.DEF_CSID = prj.ROOT_PATH + '/default.js';
prj.DB_PATH = prj.LIB_PATH + '/db';
prj.GSTATE_PATH = prj.LIB_PATH + '/gstate';
prj.SSL_PATH = prj.ROOT_PATH + '/ssl';
prj.TMP_PATH = '/tmp'; //os.tmpdir() || '/tmp';
prj.DEV_STATUS_TIMEOUT = 180000; //180 sec
prj.DEV_IDLE_PT = 50; //5 sec
prj.DEV_FAST_PT = 20; //1.5 sec
prj.DEV_FAST_PT_TIMEOUT = 20000; //20 sec
prj.REQ_SEND_RATE = 200;//200; //at least waits 200ms for a req
prj.IOREG_RATE = 1000; //at least waits 1000ms for a req
prj.RATE_LIMIT = 10;
prj.EN_RATE_CONTROL = inCiServ ? false : true;

// -------------------------------------------------------------------------------------------------------------------------
// Database Setting
// -------------------------------------------------------------------------------------------------------------------------
prj.DB_ADDR = '127.0.0.1';
prj.DB_PORT = '3306';
prj.DB_USER = 'root';
prj.DB_PSWD = '';
prj.DB_SOCK = '';
prj.DB_ENGINE = 'ENGINE=INNODB';
prj.DB_POOL_SZ = 20;
prj.DB_POOLS = [{
  DB1: {ADDR: '127.0.0.1', PORT: 3306, USER: '', PSWD: '', SOCK: ''},
  DB2: {ADDR: '127.0.0.1', PORT: 3306, USER: '', PSWD: '', SOCK: ''},
  DB3: {ADDR: '127.0.0.1', PORT: 3306, USER: '', PSWD: '', SOCK: ''}
// }, {
//     DB1: {ADDR: '127.0.0.1', PORT: 3306, USER: '', PSWD: '', SOCK: ''},
//     DB2: {ADDR: '127.0.0.1', PORT: 3306, USER: '', PSWD: '', SOCK: ''},
//     DB3: {ADDR: '127.0.0.1', PORT: 3306, USER: '', PSWD: '', SOCK: ''}
}];

// Cloud Status
prj.NODE_ADMIN_ADDR = '';
prj.ADMIN_DB_PORT = '';
prj.ADMIN_DB_USER = '';
prj.ADMIN_DB_PSWD = '';

// -------------------------------------------------------------------------------------------------------------------------
// Project Setting (All)
// -------------------------------------------------------------------------------------------------------------------------
prj.PRODUCT_NAME = 'Unknown Platform';
prj.MAX_COMPANY  = 10000;
prj.ENABLE_HTTP2_SERV = false;
prj.HTTP2_PORT  = 443;
prj.HTTP2_ADDR  = '0.0.0.0';
prj.HTTP_PORT   = 80;
prj.HTTP_ADDR   = '0.0.0.0';
prj.EN_REGULAR  = false;
prj.EN_SRV_LOGGING = false;
prj.SOC_NAME    = os.cpus()[0].model;
prj.MODEL_NAME  = '';
prj.CUSTOMER    = 'KSMT';
prj.HW_VER      = '';
prj.FW_VER      = 'v1.01';
prj.FW_KEY      = 'KSMT';

// Session settings
prj.SESSION_AGE     = 86400000; //86400 sec
prj.SESSION_SECRET  = 'ZOPi3nv1O4QNgk1b';

// SMTP
prj.SMTP_CONN_TIMEOUT = 20000; // 20sec
prj.SMTP_HOST   = '';
prj.SMTP_PORT   = 25;
prj.SMTP_USER   = '';
prj.SMTP_PSWD   = '';

// Backup SMTP
prj.SMTP_HOST_2 = '';
prj.SMTP_PORT_2 = 25;
prj.SMTP_USER_2 = '';
prj.SMTP_PSWD_2 = '';

// -------------------------------------------------------------------------------------------------------------------------
// Push Server Settings (China)
// -------------------------------------------------------------------------------------------------------------------------
prj.GCM_API_KEY = '';
prj.LC_HOST     = 'api.leancloud.cn';
prj.LC_APP_ID   = '';
prj.LC_APP_KEY  = '';
prj.LC_APP_ID_HYEC   = '';
prj.LC_APP_KEY_HYEC  = '';
prj.LC_APP_ID_YATEC  = '';
prj.LC_APP_KEY_YATEC = '';
prj.LC_APP_ID_LILU   = '';
prj.LC_APP_KEY_LILU  = '';

// -------------------------------------------------------------------------------------------------------------------------
// Push Server Settings (US Site)
// -------------------------------------------------------------------------------------------------------------------------
prj.LCUS_PROXY  = 'proxy-ksmt.rhcloud.com';
prj.LCUS_HOST   = 'us-api.leancloud.cn';
prj.LCUS_APP_ID  = '';
prj.LCUS_APP_KEY = '';
prj.LCUS_APP_ID_HYEC   = '';
prj.LCUS_APP_KEY_HYEC  = '';
prj.LCUS_APP_ID_YATEC  = '';
prj.LCUS_APP_KEY_YATEC = ''
prj.LCUS_APP_ID_LILU   = '';
prj.LCUS_APP_KEY_LILU  = '';

// -------------------------------------------------------------------------------------------------------------------------
// Push Type Settings
// -------------------------------------------------------------------------------------------------------------------------
prj.LC_CONFS = {
  0 : { HOST: prj.LC_HOST,   CLOUD: 'KSMT-CN',  TYPE: 'Android', APP_ID: prj.LC_APP_ID,         APP_KEY: prj.LC_APP_KEY},
  1 : { HOST: prj.LC_HOST,   CLOUD: 'KSMT-CN',  TYPE: 'iOS-dev', APP_ID: prj.LC_APP_ID,         APP_KEY: prj.LC_APP_KEY},
  2 : { HOST: prj.LC_HOST,   CLOUD: 'KSMT-CN',  TYPE: 'iOS',     APP_ID: prj.LC_APP_ID,         APP_KEY: prj.LC_APP_KEY},
  3 : { HOST: prj.LCUS_HOST, CLOUD: 'KSMT-US',  TYPE: 'Android', APP_ID: prj.LCUS_APP_ID,       APP_KEY: prj.LCUS_APP_KEY},
  4 : { HOST: prj.LCUS_HOST, CLOUD: 'KSMT-US',  TYPE: 'iOS-dev', APP_ID: prj.LCUS_APP_ID,       APP_KEY: prj.LCUS_APP_KEY},
  5 : { HOST: prj.LCUS_HOST, CLOUD: 'KSMT-US',  TYPE: 'iOS',     APP_ID: prj.LCUS_APP_ID,       APP_KEY: prj.LCUS_APP_KEY},
  6 : { HOST: prj.LC_HOST,   CLOUD: 'HYEC-CN',  TYPE: 'Android', APP_ID: prj.LC_APP_ID_HYEC,    APP_KEY: prj.LC_APP_KEY_HYEC},
  7 : { HOST: prj.LC_HOST,   CLOUD: 'HYEC-CN',  TYPE: 'iOS-dev', APP_ID: prj.LC_APP_ID_HYEC,    APP_KEY: prj.LC_APP_KEY_HYEC},
  8 : { HOST: prj.LC_HOST,   CLOUD: 'HYEC-CN',  TYPE: 'iOS',     APP_ID: prj.LC_APP_ID_HYEC,    APP_KEY: prj.LC_APP_KEY_HYEC},
  9 : { HOST: prj.LCUS_HOST, CLOUD: 'HYEC-US',  TYPE: 'Android', APP_ID: prj.LCUS_APP_ID_HYEC,  APP_KEY: prj.LCUS_APP_KEY_HYEC},
  10: { HOST: prj.LCUS_HOST, CLOUD: 'HYEC-US',  TYPE: 'iOS-dev', APP_ID: prj.LCUS_APP_ID_HYEC,  APP_KEY: prj.LCUS_APP_KEY_HYEC},
  11: { HOST: prj.LCUS_HOST, CLOUD: 'HYEC-US',  TYPE: 'iOS',     APP_ID: prj.LCUS_APP_ID_HYEC,  APP_KEY: prj.LCUS_APP_KEY_HYEC},
  12: { HOST: prj.LC_HOST,   CLOUD: 'YATEC-CN', TYPE: 'Android', APP_ID: prj.LC_APP_ID_YATEC,   APP_KEY: prj.LC_APP_KEY_YATEC},
  13: { HOST: prj.LC_HOST,   CLOUD: 'YATEC-CN', TYPE: 'iOS-dev', APP_ID: prj.LC_APP_ID_YATEC,   APP_KEY: prj.LC_APP_KEY_YATEC},
  14: { HOST: prj.LC_HOST,   CLOUD: 'YATEC-CN', TYPE: 'iOS',     APP_ID: prj.LC_APP_ID_YATEC,   APP_KEY: prj.LC_APP_KEY_YATEC},
  15: { HOST: prj.LCUS_HOST, CLOUD: 'YATEC-US', TYPE: 'Android', APP_ID: prj.LCUS_APP_ID_YATEC, APP_KEY: prj.LCUS_APP_KEY_YATEC},
  16: { HOST: prj.LCUS_HOST, CLOUD: 'YATEC-US', TYPE: 'iOS-dev', APP_ID: prj.LCUS_APP_ID_YATEC, APP_KEY: prj.LCUS_APP_KEY_YATEC},
  17: { HOST: prj.LCUS_HOST, CLOUD: 'YATEC-US', TYPE: 'iOS',     APP_ID: prj.LCUS_APP_ID_YATEC, APP_KEY: prj.LCUS_APP_KEY_YATEC},
  18: { HOST: prj.LC_HOST,   CLOUD: 'LILU-CN',  TYPE: 'Android', APP_ID: prj.LC_APP_ID_LILU,    APP_KEY: prj.LC_APP_KEY_LILU},
  19: { HOST: prj.LC_HOST,   CLOUD: 'LILU-CN',  TYPE: 'iOS-dev', APP_ID: prj.LC_APP_ID_LILU,    APP_KEY: prj.LC_APP_KEY_LILU},
  20: { HOST: prj.LC_HOST,   CLOUD: 'LILU-CN',  TYPE: 'iOS',     APP_ID: prj.LC_APP_ID_LILU,    APP_KEY: prj.LC_APP_KEY_LILU},
  21: { HOST: prj.LCUS_HOST, CLOUD: 'LILU-US',  TYPE: 'Android', APP_ID: prj.LCUS_APP_ID_LILU,  APP_KEY: prj.LCUS_APP_KEY_LILU},
  22: { HOST: prj.LCUS_HOST, CLOUD: 'LILU-US',  TYPE: 'iOS-dev', APP_ID: prj.LCUS_APP_ID_LILU,  APP_KEY: prj.LCUS_APP_KEY_LILU},
  23: { HOST: prj.LCUS_HOST, CLOUD: 'LILU-US',  TYPE: 'iOS',     APP_ID: prj.LCUS_APP_ID_LILU,  APP_KEY: prj.LCUS_APP_KEY_LILU},
};

// -------------------------------------------------------------------------------------------------------------------------
// Difference Settings for different Platforms and Customers
// -------------------------------------------------------------------------------------------------------------------------
if(inDocker || inLinode) { // Linode
  hostname = (inDocker) ? hostname + ".ksmt.co" : hostname;
  prj.PRODUCT_NAME        = 'KCloud';
  prj.MODEL_NAME          = 'linux';
  prj.ENABLE_HTTP2_SERV   = true;

  // DB
  if(hostname.match(/^hyec-.*\.ksmt\.co/g)) {
    prj.CUSTOMER        = 'HYEC';
    prj.DB_USER         = '';
    prj.DB_PSWD         = '';
  } else if(hostname.match(/^yatec-.*\.ksmt\.co/g)) {
    prj.CUSTOMER        = 'YATEC';
    prj.DB_USER         = '';
    prj.DB_PSWD         = '';
  } else { // KSMT default settings ...
    prj.CUSTOMER        = 'KSMT';
    prj.DB_USER         = '';
    prj.DB_PSWD         = '';
  }

  // Node settings
  if(prj.CUSTOMER === 'HYEC') {
    if(hostname.match(/^hyec-node-01\.ksmt\.co/g)) {
      prj.EN_REGULAR      = true;
      prj.EN_SRV_LOGGING  = true;
    }
    // hyec-node-0X.ksmt.co
    if(inDocker) {
      prj.DB_ADDR  = 'db-01';
      prj.DB_PORT  = 3306;
      prj.DBS = [{
        WIDX: 0,
        POOLS: [
          {ADDR: 'db-01', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'db-02', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'db-03', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
        ]
      }];
    } else {
      prj.DB_ADDR  = 'hyec-db-01';
      prj.DB_PORT  = 3306;
      prj.DBS = [{
        WIDX: 0,
        POOLS: [
          {ADDR: 'hyec-db-01', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'hyec-db-02', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'hyec-db-03', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
        ]
      }];
    }
  } else if(prj.CUSTOMER === 'YATEC') {
    if(hostname.match(/^yatec-node-01\.ksmt\.co/g)) {
      prj.EN_REGULAR      = true;
      prj.EN_SRV_LOGGING  = true;
    }
    // yatec-cloud.ksmt.co
    if(inDocker) {
      prj.DB_ADDR  = 'db-01';
      prj.DB_PORT  = 3306;
      prj.DBS = [{
        WIDX: 0,
        POOLS: [
          {ADDR: 'db-01', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'db-02', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'db-03', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
        ]
      }];
    } else {
      prj.DB_ADDR  = 'yatec-db-01';
      prj.DB_PORT  = 3306;
      prj.DBS = [{
        WIDX: 0,
        POOLS: [
          {ADDR: 'yatec-db-01', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'yatec-db-02', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'yatec-db-03', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
        ]
      }];
    }
  } else { // KSMT
    if(hostname.match(/^node-admin\.ksmt\.co/g)) {
      prj.EN_REGULAR      = true;
      prj.EN_SRV_LOGGING  = true;
      prj.DB_SOCK         = '/var/run/mysqld/mysqld.sock';
      prj.DB_PORT         = 3306;
      prj.DBS             = [{WIDX: 0, POOLS: [{ADDR: 'localhost', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: prj.DB_SOCK, STAT: false, CONN: null}]}];
    } else if(hostname.match(/^ci\.ksmt\.co/g)) {
      prj.ENABLE_HTTP2_SERV = false;
      prj.HTTP_PORT       = 8081;
      prj.EN_REGULAR      = true;
      prj.EN_SRV_LOGGING  = true;
      prj.DB_SOCK         = '/var/run/mysqld/mysqld.sock';
      prj.DB_PORT         = 3306;
      prj.DBS             = [{WIDX: 0, POOLS: [{ADDR: 'localhost', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: prj.DB_SOCK, STAT: false, CONN: null}]}];
    } else if(inDocker) { // docker
      if(hostname.match(/^node-01\.ksmt\.co/g)) { // first one
        prj.EN_REGULAR      = true;
        prj.EN_SRV_LOGGING  = true;
      }
      prj.DB_ADDR  = 'db-01';
      prj.DB_PORT  = 3306;
      prj.DBS = [{
        WIDX: 0,
        POOLS: [
          {ADDR: 'db-01', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'db-02', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          //{ADDR: 'db-03', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
        ]
      }, {
        WIDX: 0,
        POOLS: [
          {ADDR: 'db-04', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          //{ADDR: 'db-05', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          //{ADDR: 'db-06', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
        ]
      }, {
        WIDX: 0,
        POOLS: [
          {ADDR: 'db-07', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          //{ADDR: 'db-08', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          //{ADDR: 'db-09', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
        ]
      }];
    } else if(hostname.match(/^node-0[12]\.ksmt\.co/g)) { // test.ksmt.co
      if(hostname.match(/^node-0[13]\.ksmt\.co/g)) { // first one
        prj.EN_REGULAR      = true;
        prj.EN_SRV_LOGGING  = true;
      }
      prj.DB_ADDR  = 'db-01';
      prj.DB_PORT  = 3306;
      prj.DBS = [{
        WIDX: 0,
        POOLS: [
          {ADDR: 'db-01', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'db-02', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'db-05', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
        ]
      }];
    } else { // cloud.ksmt.co
      if(hostname.match(/^node-0[13]\.ksmt\.co/g)) { // first one
        prj.EN_REGULAR      = true;
        prj.EN_SRV_LOGGING  = true;
      }
      prj.DB_ADDR  = 'db-03';
      prj.DB_PORT  = 3306;
      prj.DBS = [{
        WIDX: 0,
        POOLS: [
          {ADDR: 'db-03', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'db-04', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
          {ADDR: 'db-06', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: '', STAT: false, CONN: null},
        ]
      }];
    }
  }
} else { // Linux server
  prj.PRODUCT_NAME        = 'KCloud';
  prj.MODEL_NAME          = 'linux';
  prj.ENABLE_HTTP2_SERV   = true;
  prj.DB_PORT             = 3306;
  prj.DB_USER             = '';
  prj.DB_PSWD             = '';
  prj.DB_SOCK             = '/var/run/mysqld/mysqld.sock';
  prj.DBS                 = [{WIDX: 0, POOLS: [{ADDR: 'localhost', PORT: prj.DB_PORT, USER: prj.DB_USER, PSWD: prj.DB_PSWD, SOCK: prj.DB_SOCK, STAT: false, CONN: null}]}];
  prj.EN_SRV_LOGGING      = true;
  prj.EN_REGULAR          = true;
}

module.exports = prj;
