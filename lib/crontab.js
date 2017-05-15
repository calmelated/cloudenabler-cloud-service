const child = require('child_process');
const asyncUtils = require('async');
const prj = require('../project');
const exec = require('child_process').exec;
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;

const tasks = [];
const isRunning = [];

const newTask = (task) => {
  if (tasks[task]) {
    dbg('The task already exists ' + task);
    return;
  }
  tasks[task] = child.fork(task);
  tasks[task].on('message', (result) => {
    isRunning[task] = false;
  });
};

const initTask = (task) => {
  newTask(task);
  tasks[task].send({
    action: 'init'
  });
};

// Cron Task  ...
const cronTask = (task) => {
  if (isRunning[task]) {
    return;
  } else {
    isRunning[task] = true;
  }

  if (!tasks[task]) {
    newTask(task);
  }
  tasks[task].send({
    action: 'regular'
  });
};

let scriptTask = (task) => {
  if (tasks[task]) {
    dbg('task already exists ' + task);
    return;
  }
  exec(task, (error, stdout, stderr) => {
    console.log('stdout: ' + stdout);
    console.log('stderr: ' + stderr);
    if (error !== null) {
      info(__file + ':' + __line + ' exec error: ' + error);
    }
  });
};

// Init (run once)
asyncUtils.parallel([
  initTask(prj.BIN_PATH + '/cron-sys'),
  // initTask(prj.BIN_PATH + '/cron-usb'),
  // initTask(prj.BIN_PATH + '/cron-sdcard'),
  //
  // scriptTask(prj.BIN_PATH + '/bin/cron-example'),
  // initTask(prj.BIN_PATH + '/bin/cron-example'),
  //
  // PUT YOUR INITIALIZE SCRIPT HERE
  //
]);

// Regular routine  (1/sec)
process.on('message', (action) => {
  asyncUtils.parallel([
    cronTask(prj.BIN_PATH + '/cron-sys'),
    // cronTask(prj.BIN_PATH + '/cron-usb'),
    // cronTask(prj.BIN_PATH + '/cron-sdcard'),
    //
    // cronTask(prj.BIN_PATH + '/cron-example'),
    //
    // PUT YOUR REGULAR SCRIPT HERE
    //
  ]);
});

// ---------------------------------------------------------------------
//  Clean up before exiting
// ----------------------------------------------------------------------
process.on('exit', () => {
  // dbg('Exit crontab ...');
  let taskNames = Object.keys(tasks);
  taskNames.forEach((taskName) => {
    // dbg(pid);
    tasks[taskName].kill();
  });
});

// happens when you press Ctrl+C
process.on('SIGINT', () => {
  info(__file + ' Gracefully shutting down from  SIGINT (Crtl-C)');
  process.exit();
});

// usually called with kill
process.on('SIGTERM', () => {
  info(__file + ' Parent SIGTERM detected (kill)');
  process.exit(0);
});
