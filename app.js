const express = require('express');
const path = require('path');
const favicon = require('static-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const prj = require('./project');
const gstate = require(prj.GSTATE_PATH);
const utils = require(prj.LIB_PATH + '/utils');
const db = require(prj.LIB_PATH + '/db');
const jobQueue = require(prj.LIB_PATH + '/job-queue');
const worker = require(prj.LIB_PATH + '/worker');
const csid = require(prj.LIB_PATH + '/csid');
const sessionStore = require(prj.LIB_PATH + '/session');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const device = require(prj.LIB_PATH + '/device');
const iosw = require(prj.LIB_PATH + '/iosw');
const complib = require(prj.LIB_PATH + '/company');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;
const regular = require(prj.LIB_PATH + '/regular');
const hostname = require('os').hostname();
const clusterId = process.env.CLUSTER_ID;
const publicDir = express.static(path.join(__dirname, 'public'));
const cronjob = require(prj.LIB_PATH + '/cronjob');

const app = express();
app.disable('x-powered-by');
app.use(favicon());
app.use(logger('[\33[1;33m' + hostname + '\33[m][\33[1;35m:remote-addr\33[m] \33[1;36m:status\33[m :method :url :response-time ms - :res[content-length]', {
  skip: (req, res) => {
    try {
      if (prj.DEBUG_MODE) {
        return false;
      } else if(!res || !res._startAt) {
        utils.logErrRequest(req, res); //, ((!res) ? 'response is lost' : 'response not yet finish'));
        return false;
      } else if(res.statusCode === 200 && req.originalUrl && res._startAt) {
        let isAcceptTime = ((res._startAt[1] - req._startAt[1]) < 650000000) ? true : false;
        if(req.originalUrl === '/ioreg' && isAcceptTime) { //  less than 650ms
          return true;
        } else if(req.originalUrl.match(/\/|\/api\/device|\/api\/advgp|\/api\/group/i) && req.method === 'GET' && isAcceptTime) {
          return true;
        }
        return false;
      } else if(res.statusCode === 302) {
        return true;
      // } else if(res.statusCode === 304) {
      //     return true;
      }
      return false;
    } catch(e) {
      console.dir(e.stack);
      return false;
    }
  }
}));

// Handle public directory (Web UI)
app.use(publicDir);
app.use(/^\/devices(\/|($|\?)).*/i, publicDir);
app.use(/^\/group(\/|($|\?)).*/i, publicDir);
app.use(/^\/alarm(\/|($|\?)).*/i, publicDir);
app.use(/^\/iostlog(\/|($|\?)).*/i, publicDir);
app.use(/^\/flink(\/|($|\?)).*/i, publicDir);
app.use(/^\/login(\/|($|\?)).*/i, publicDir);
app.use(/^\/admin(\/|($|\?)).*/i, publicDir);
app.use(/^\/superadmin(\/|($|\?)).*/i, publicDir);

// Ready to remove laster ..
app.use(/^\/accounts(\/|($|\?)).*/i, publicDir);
app.use(/^\/audit(\/|($|\?)).*/i, publicDir);
app.use(/^\/company(\/|($|\?)).*/i, publicDir);
app.use(/^\/companys(\/|($|\?)).*/i, publicDir);
app.use(/^\/csid(\/|($|\?)).*/i, publicDir);
app.use(/^\/smtp(\/|($|\?)).*/i, publicDir);
app.use(/^\/sessions(\/|($|\?)).*/i, publicDir);
app.use(/^\/ftp(\/|($|\?)).*/i, publicDir);

// Parse req.body and cookie
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(cookieParser());

// ---------------------------------------------------------------------
// Ignore Empty header
// ----------------------------------------------------------------------
app.use((req, res, next) => {
  if (req.path.match("/") && Object.keys(req.headers).length === 0) {
    return res.end();
  } else {
    next();
  }
});

// ---------------------------------------------------------------------
// Allow Cross-Domain 
// ----------------------------------------------------------------------
if(prj.IN_DOCKER || hostname.match(/.*-admin.ksmt.co/i)) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin' , ['http://localhost:3000']);
    res.header('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With');
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Credentials', true);
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });
}

// ---------------------------------------------------------------------
// Strt to apply async/await 
// ----------------------------------------------------------------------
app.use(async((req, res, next) => { next(); }));

// ---------------------------------------------------------------------
// device ioreg -> No need session
// ----------------------------------------------------------------------
app.use('/ioreg', require('./routes/ioreg'));

// ---------------------------------------------------------------------
//  Session Initization
// ----------------------------------------------------------------------
let lastSession = null;
const productName = csid.mget('C', 'PRODUCT_NAME');
const sessionSecret = csid.mget('C', 'SESSION_SECRET');
const sessionAge = csid.mget('C', 'SESSION_AGE', 'int');
app.use((req, res, next) => {
  if(!lastSession) {
    lastSession = session({
      name: (productName) ? productName : prj.PRODUCT_NAME,
      secret: (sessionSecret) ? sessionSecret : prj.SESSION_SECRET,
      store: sessionStore.store(0),
      saveUninitialized: false,
      resave: false,
      cookie: {
        maxAge: (sessionAge) ? sessionAge : prj.SESSION_AGE,
      },
    }) (req, res, next);   
  }
  return lastSession;
});

// ---------------------------------------------------------------------
//  Rate control
// ----------------------------------------------------------------------
let rcTable = {}; 
let rcCount = {}; 

app.use((req, res, next) => {
  // dbg(req.sessionID);
  if(!prj.EN_RATE_CONTROL) {
    return next();
  } else if(!req.sessionID) {
    return next();
  } else if(req.path.match("/api/device/import") || 
    req.path.match("/api/user/auth")) {
    return next();
  }
  let now = Date.now();
  if((now - rcTable[req.sessionID]) < prj.REQ_SEND_RATE) {
    rcCount[req.sessionID] = rcCount[req.sessionID] || 0;
    if((rcCount[req.sessionID]++) > prj.RATE_LIMIT) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.SEND_TOO_FAST});
    }
  } else {
    rcCount[req.sessionID] = rcCount[req.sessionID] / 2;
    rcCount[req.sessionID] = (rcCount[req.sessionID] < 1) ? 0 : rcCount[req.sessionID];
  }
  rcTable[req.sessionID] = now;
  return next();
});    

// ---------------------------------------------------------------------
//  Update user session to DB
// ----------------------------------------------------------------------
app.use(async((req, res, next) => {
  if(!req.session.user) { // not login user
    return next();
  } else if(req.session.user.trial && req.session.user.trial === 1) { // trial user
    return next();
  } 

  // check if uesr's subcompany still existed
  if(req.session.user._companyId) {
    let dbsIdx = req.session.user.dbsIdx;
    let companyId = req.session.user.companyId;
    let cmpInfo = await(complib.getInfoByDbIdx(dbsIdx, companyId));
    if(!cmpInfo || cmpInfo.err) { // subcomany been removed
      dbg('subcomany ' + companyId + ' not existed!');
      sessionStore.logout(req.sessionID);
      complib.logoutSubcomp(req.session.user);
      return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_AUTH});
    }
  }

  // update expired infomation evey 5 min
  let lastExpires = req.session.cookie.expires.getTime();
  req.session.touch();
  if((req.session.cookie.expires.getTime() - lastExpires) > 300000) {
    req.session.save((err) => { dbg({__file, __line, err}); });
  }
  return next();
}));

// ---------------------------------------------------------------------
//  Check if under maintenance 
// ----------------------------------------------------------------------
app.use((req, res, next) => {
  if(req.path.match('/ioreg')) {
    return next(); //  already sync, don't do it again
  } else if(req.session.user && req.session.user.companyId) {
    let srvUpg = await(csid.get('S','SERV_UPGRADING','int'));
    if(srvUpg > 1420070400 && srvUpg > parseInt(Date.now() / 1000)) {
      if (req.path.match(/^\/api/)) {
        return res.status(gstate.RC_SERV_UNAVAILABLE).send({backTime: srvUpg});
      } else {
        return res.redirect('/maintenance.html');
      }
    }
  }
  next();
});

// ---------------------------------------------------------------------
//  Trustable Session
// ----------------------------------------------------------------------
app.use((req, res, next) => {
  if (req.path.match(/\/device\/profile\/([0-9A-F]{2}[:-]){5}([0-9A-F]{2})/ig)) { // from cloud enabler
    req.session.trustable = true;
  } else if (req.path.match(/\/gcm\/remove/ig)) { // from gcm/remove
    req.session.trustable = true;
  } else if (req.path.match(/\/device\/([0-9A-F]{2}[:-]){5}([0-9A-F]{2})\/ce\/profile/ig)) { // from cloud enabler
    req.session.trustable = true;
  }
  next();
});

// ---------------------------------------------------------------------
//  APIs without authenication
// ----------------------------------------------------------------------
app.use('/', require('./routes/index'));
app.use('/api/login', require('./routes/auth'));
app.use('/api/logout', require('./routes/auth'));
app.use('/api/company/add', require('./routes/auth'));
app.use('/login/superAdmin', require('./routes/auth'));

// ---------------------------------------------------------------------
//  APIs which need session
// ----------------------------------------------------------------------
app.use((req, res, next) => {
  if(req.session.trustable) {
    next();
  } else if (!req.session.user) {
    res.status(gstate.RC_NO_AUTH).send({
      desc: gstate.NO_AUTH,
      rd: '/login'
    });
  } else {
    next();
  }
});

// ---------------------------------------------------------------------
//  Account activation
// ----------------------------------------------------------------------
app.use('/api/user/activate', require('./routes/auth'));
app.use((req, res, next) => {
  if(req.session.trustable) {
    next();
  } else if (req.session.user.admin === 0 && req.session.user.activate === 0) {
    res.status(gstate.RC_NO_AUTH).send({
      desc: gstate.NO_ACTIVATE,
      rd: '/user/activate'
    });
  } else {
    next();
  }
});

app.use('/device'    , require('./routes/device'));
app.use('/api/device', require('./routes/device'));
app.use('/api/slvdev', require('./routes/slvdev'));
app.use('/api/logout', require('./routes/auth'));
app.use('/api/login/status', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/company', require('./routes/company'));
app.use('/api/group', require('./routes/group'));
app.use('/api/advgp', require('./routes/advgp'));
app.use('/api/gcm', require('./routes/gcm'));
app.use('/api/alarm', require('./routes/alarm'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/iostlog', require('./routes/iostlog'));
app.use('/api/announce', require('./routes/announce'));
app.use('/api/flink', require('./routes/flink'));
app.use('/api/lilu', require('./routes/lilu'));

// Super Admin
app.use('/api/session', (req, res, next) => {return (req.session.user.superAdmin) ? require('./routes/session')(req, res)  : next();});
app.use('/api/csid',    (req, res, next) => {return (req.session.user.superAdmin) ? require('./routes/csid')(req, res)     : next();});
app.use('/api/ftpcli',  (req, res, next) => {return (req.session.user.superAdmin) ? require('./routes/ftpcli')(req, res)   : next();});
app.use('/api/smtp',    (req, res, next) => {return (req.session.user.superAdmin) ? require('./routes/smtp')(req, res)     : next();});
app.use('/_debug',      (req, res, next) => {return (req.session.user.superAdmin || req.session.user.company === 'KSMT Microtech') ? require('./routes/debug')(req, res)  : next();});

/// catch 404 and forward to error handler
app.use((req, res, next) => {
  let err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// Error handler
app.use((err, req, res, next) => {
  utils.logErrRequest(req, res, err);
  if(err && err.message && err.message.match(/ECONNREFUSED|ER_UNKNOWN_COM_ERROR/i)) {
    await(db.chkDBPools());
    lastSession = null;
  }
  if (req.path.match(/^\/api/)) {
    return res.status((err.status || 500)).send({
      desc: err.message,
      error: err,
    });
  } else {
    return res.redirect('/error.html');
  }
});

// ---------------------------------------------------------------------
//  Regular routine (For all instances)
// ----------------------------------------------------------------------
cronjob.add('Regular.Minute', '0 *  *  *  *  *', async(() => { 
  await(db.chkDBPools()); 
}));

// ---------------------------------------------------------------------
//  Regular Job Queue
// ----------------------------------------------------------------------
let host = hostname + '-' + clusterId;
let hostId = parseInt(hostname.split('-').pop());
cronjob.add('CheckJobQueue', '*/' + ((hostId && (hostId % 2) === 0) ? 3 : 5) + ' *  *  *  *  *', async(() => { 
  await(jobQueue.check(host));
}));

// ---------------------------------------------------------------------
//  Regular Reset Rate Control
// ----------------------------------------------------------------------
if(prj.EN_RATE_CONTROL) {
  dbg('Enable Rate Control!');
  cronjob.add('Reset.Rate.Control', '0 0 0 *  *  *', () => { 
    info('Reset Rate Control to default settings!');
    rcTable = {};
    rcCount = {};
  });
}

// ---------------------------------------------------------------------
//  Things only do in the first cluster
// ----------------------------------------------------------------------
if(clusterId === '0') {
  if(prj.EN_REGULAR) { // Regular Job
    cronjob.add('Regular.Daily', '0 0 0 *  *  *', async(() => {
      cronjob.flags.purge = 1500;
      await(regular.rstAlarmCnt());
      await(regular.purgeLog());
      await(regular.purgeRegLog('day'));
      await(regular.purgeRegLog('month'));
      await(regular.purgeRegLog('year'));
    }));
  }
  if(prj.EN_SRV_LOGGING) {
    //                         ss   mm   hh  dd  mo  week
    cronjob.add('LogRawData',   '0    *    *   *   *   *', async(() => { cronjob.flags.logRaw   =     5; regular.logData('raw');     })); // 1min 
    cronjob.add('PurgeRawData', '0    0    *   *   *   *', async(() => { cronjob.flags.purgeRaw =   120; regular.purgeRegLog('raw'); })); // purge every hours
    cronjob.add('LogDayData',   '0    0    *   *   *   *', async(() => { cronjob.flags.logDay   =   120; regular.logData('day');     })); // 1hr
    cronjob.add('LogMonthData', '0    0    0   *   *   *', async(() => { cronjob.flags.logMonth =  1500; regular.logData('month');   })); // 1day
    cronjob.add('LogYearData',  '0    0    0   1   *   *', async(() => { cronjob.flags.logYear  = 46500; regular.logData('year');    })); // first day of month

    cronjob.add('LogDayData1',  '0   30    *   *   *   *', async(() => { regular.logData('day');     })); // 1hr 
    cronjob.add('LogMonthData1','0    0   12   *   *   *', async(() => { regular.logData('month');   })); // 1day
    cronjob.add('LogYearData1', '0    0    0  15   *   *', async(() => { regular.logData('year');    })); // first day of month
  }
}

// ---------------------------------------------------------------------
//  Clean up before exiting
// ----------------------------------------------------------------------
process.on('exit', (e) => {
  info('Process ' + process.pid + ' is exiting ... ');
});

// happens when you press Ctrl+C
process.on('SIGINT', () => {
  info('Process ' + process.pid + ' is gracefully shutting down from  SIGINT (Crtl-C)');
  process.exit(0);
});

// usually called with kill
process.on('SIGTERM', () => {
  info('Process ' + process.pid + ': SIGTERM detected (Kill)');
  //process.exit(0);
});

process.on('uncaughtException', (err) => {
  info(new Date().toUTCString());
  info(err.stack);
});

module.exports = app;

