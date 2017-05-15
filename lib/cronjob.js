const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const utils = require(prj.LIB_PATH + '/utils');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const CronJob = require('cron').CronJob;
const self = module.exports; 

let timer;
const CHECK_INTVAL = 60000;
module.exports.jobs = {};
module.exports.flags = {
  logRaw:       5,
  logDay:     120,
  logMonth:  1500,
  logYear:  46500,
  purge:     1500,
  purgeRaw:   120,
};

module.exports.add = (name, time, cbFunc) => {
  try {
    self.jobs[name] = new CronJob(time, cbFunc, null, true);  
  } catch (e) {
    info(e);
  }
};

module.exports.status = (doCheck = false) => {
  let ret = {};
  let jobNames = Object.keys(self.jobs);
  for(let i = 0; i < jobNames.length; i++) {
    let jobName = jobNames[i];
    let job = self.jobs[jobName];
    if(job && job.running) {
      // info('CronJob: ' + jobName + ' okok');
      ret[jobName] = 1;
    } else {
      ret[jobName] = 0;
      info('CronJob: ' + jobName + ' was died!');
      if(doCheck) {
        info('Restart CronJob: ' + jobName);
        job.start();
      }
    }
  }
  let flagNames = Object.keys(self.flags);
  for(let i = 0; i < flagNames.length; i++) {
    let flagName = flagNames[i];
    if(doCheck) {
      if(self.flags[flagName] < 1) {
        ret[flagName] = 0;
      } else if((self.flags[flagName] - 1) < 1) {
        info('CronJob: ' + flagName + ' was died!');
        self.flags[flagName] = 0;
        ret[flagName] = 0;
      } else {
        self.flags[flagName] = self.flags[flagName] - 1;
        ret[flagName] = self.flags[flagName];
      }
    } else {
        ret[flagName] = self.flags[flagName];
    }
  }
  return ret;  
};

module.exports.check = () => {
  if(timer) { clearTimeout(timer); }
  timer = setTimeout(self.check, CHECK_INTVAL);
  self.status(true);
};

// Start to check alive
dbg('CronJob check alive!');
self.check();

