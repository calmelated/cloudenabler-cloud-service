const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const db = require(prj.LIB_PATH + '/db');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const csid = require(prj.LIB_PATH + '/csid');
const utils = require(prj.LIB_PATH + '/utils');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const CronJob = require('cron').CronJob;
const worker = require(prj.LIB_PATH + '/worker');
const os = require('os');
const hostname = os.hostname();
const jobQueue = module.exports; 
let hostId = parseInt(hostname.split('-').pop()); hostId = isNaN(hostId) ? 0 : hostId;
const clusterId = process.env.CLUSTER_ID;
const jobPrefix = (Math.floor(Math.random() * 9) + 1) + '' + (Math.floor(Math.random() * 9) + 1) + hostId + clusterId;
const MAX_CONCURRENT_JOB = 25;
const MIN_CONCURRENT_JOB = 5;

let jobIdx = 0;
let lastJobs = MIN_CONCURRENT_JOB;
let curJobs = MIN_CONCURRENT_JOB; 
new CronJob('0 * * *  *  *', () => {
  let loadavg = os.loadavg();
  if(loadavg[1] >= 0.9 && curJobs > MIN_CONCURRENT_JOB) { // heavy 
    curJobs = curJobs - 2;
  } else if(loadavg[1] >= 0.7 && loadavg[1] < 0.9) { // keep the same
    curJobs = curJobs;
  } else if(curJobs <= MAX_CONCURRENT_JOB) { // light loading 
    curJobs = curJobs + 1;
  }
  if(lastJobs !== curJobs) {
    info('# of concurrent jobs is ' + curJobs + ', last is ' + lastJobs);
  }
  lastJobs = curJobs;
}, null, true);  // 1 minute

module.exports.add = (tasks) => {
  // dbg('push jobs to job-queue ... !');   
  let id, qStr = '';
  tasks = (Array.isArray(tasks)) ? tasks : [tasks];
  for(let task of tasks) {
    if(!task) { continue; }
    let execTime = utils.has(task.execTime) ? task.execTime : parseInt(Date.now() / 1000);
    task = utils.toJsonStr(task, {__file, __line});
    jobIdx = (jobIdx >= 10000) ? 0 : jobIdx;
    id = jobPrefix * 10000 + (jobIdx++);
    qStr += 'INSERT INTO `' + db.TB_JOB_QUEUE + '` (`id`,`execTime`,`status`,`task`) VALUES (' + id + ',' + execTime + ', 0, \'' + task + '\');';
    if(qStr.length >= 1048576) { // 1024 * 1024
      let result = await(db.pr_wquery(0, qStr));
      if(result.err) {
        dbg(result.err);
      } 
      qStr = '';
    }
  }
  if(qStr && qStr.length > 0) {
    let result = await(db.pr_wquery(0, qStr));
    if(result.err) {
      dbg(result.err);
    }
  }
};

module.exports.available = () => {
  // dbg('has any empty job from job-queue ... !');
  let qStr = 'SELECT `id` FROM `' + db.TB_JOB_QUEUE + '` WHERE `status` = 0 LIMIT 1;';
  let result = await(db.pr_query(0, qStr));
  if (result.err || result.data.length === 0) {
    return false;
  } 
  return true; 
};

// Called as init, makes all unfinished tasks be rescheduled
module.exports.resetUnDone = (host) => {
  // dbg('Reset undone jobs at init ..');
  let qStr = 'UPDATE `' + db.TB_JOB_QUEUE + '` SET `status` = 0,`host` = \'\' WHERE `host` = \''+ host + '\' AND `status` = 1 LIMIT 1000;';
  let result = await(db.pr_wquery(0, qStr));
  if (result.err || result.data.length === 0) {
    dbg(result.err);
  }
};

module.exports.mark = (host) => {
  // dbg('get 1 job from job-queue ... !');
  let now = parseInt(Date.now() / 1000);
  let qStr = 'SELECT `id` FROM `' + db.TB_JOB_QUEUE + '` WHERE `status` = 0 AND `execTime` <= ' + now + ' ORDER BY `execTime` LIMIT ' + curJobs + ';';
  let result = await(db.pr_query(0, qStr));
  if (result.err || result.data.length === 0) {
    return; //dbg(result.err);
  }  

  qStr = '';
  for(let i = 0; i < result.data.length; i++) {
    let id = result.data[i].id;
    qStr += 'UPDATE `' + db.TB_JOB_QUEUE + '` SET `host` = \'' + host + '\',`status` = 1 WHERE `status` = 0 AND id = ' + result.data[i].id + ';';
  }
  result = await(db.pr_wquery(0, qStr));
  if (result.err) {
    return dbg(result.err);
  }    
};

module.exports.get = (host) => {
  let qStr = 'SELECT `id`,`task`,`execTime` FROM `' + db.TB_JOB_QUEUE + '` WHERE `status` = 1 AND `host` = \''+ host + '\' LIMIT ' + curJobs + ';';
  let result = await(db.pr_query(0, qStr));
  if (result.err || result.data.length === 0) {
    return; //dbg(result.err);
  }
  let tasks = [];
  for(let i = 0; i < result.data.length; i++) {
    let task = utils.toJson(result.data[i].task, {__file, __line});
    if(!task) {
      continue;
    }
    tasks.push({
      id: result.data[i].id,
      execTime: result.data[i].execTime,
      task: task,
    });
  }
  return tasks;
};

module.exports.done = (jobs) => {
  jobs = (Array.isArray(jobs)) ? jobs : [jobs];
  let qStr = '';
  for(let job of jobs) {
    if(job) { 
      qStr += 'DELETE FROM `' + db.TB_JOB_QUEUE + '` WHERE `id` = ' + job.id + ';';
    }
  }
  if(qStr && qStr.length > 0) {
    let result = await(db.pr_wquery(0, qStr));
    if(result.err) {
      dbg(result.err);
    }
  }
};

module.exports.reschedule = (host, jobs) => {
  jobs = (Array.isArray(jobs)) ? jobs : [jobs];
  let time = parseInt(Date.now() / 1000);  
  let qStr = '';
  for(let job of jobs) {
    if(job) { 
      qStr += 'UPDATE `' + db.TB_JOB_QUEUE + '` SET `host` = \'' + host + '\',`execTime` = ' + time + ', `status` = 0 WHERE `id` = ' + job.id + ';';
    }
  }
  if(qStr && qStr.length > 0) {
    let result = await(db.pr_wquery(0, qStr));
    if(result.err) {
      dbg(result.err);
    }
  }
};

module.exports.lock = false;
module.exports.check = (host) => {
  if(jobQueue.lock) { 
    return; // dbg('locked!!');
  } 
  jobQueue.lock = true;
  while(true) {
    await(jobQueue.mark(host));

    let jobs = await(jobQueue.get(host));
    if(!jobs) { break; } 

    // Run jobs
    let results = [];
    for(let i = 0; i < jobs.length; i++) {
      results[i] = worker.execute(jobs[i]);
    }
    results = await(results);

    // Wait for results
    let finJobs = [];
    let failedJobs = [];
    for(let i = 0; i < results.length; i++) {
      if(results[i]) { // success
        finJobs.push(jobs[i]);
      } else { // failed
        failedJobs.push(jobs[i]);
      }
    }
    if(finJobs.length > 0) {
      await(jobQueue.done(finJobs));
    }
    if(failedJobs.length > 0) {
      await(jobQueue.reschedule(host, failedJobs));
    }
  }
  jobQueue.lock = false;
};

