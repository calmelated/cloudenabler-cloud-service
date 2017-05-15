const path = require('path');
const prj = require('../project');

Object.defineProperty(global, '__stack', {
  get: function() {
    let orig = Error.prepareStackTrace;
    Error.prepareStackTrace = function(_, stack) {
      return stack;
    };
    let err = new Error();
    Error.captureStackTrace(err, arguments.callee);
    let stack = err.stack;
    Error.prepareStackTrace = orig;
    return stack;
  }
});

Object.defineProperty(global, '__line', {
  get: function() {
    return __stack[1].getLineNumber();
  }
});

Object.defineProperty(global, '__file', {
  get: function() {
    return path.basename(__stack[1].getFileName());
  }
});

Object.defineProperty(global, '__dir', {
  get: function() {
    return path.extname(__stack[1].dirname());
  }
});

Object.defineProperty(global, '__ext', {
  get: function() {
    return path.extname(__stack[1].getFileName());
  }
});

Object.defineProperty(global, '__func', {
  get: function() {
    return __stack[1].getFunctionName();
  }
});

Object.defineProperty(global, '__dbg', {
  get: function() {
    return __stack[1].getFunctionName() + '():' + __stack[1].getLineNumber();
  }
});

Object.defineProperty(global, '__throw', {
  get: function() {
    throw path.basename(__stack[1].getFileName()) + ':' + __stack[1].getLineNumber() + ' ' ;
  }
});

module.exports.info = (data, object) => {
  if(typeof data === 'object') {
    if(data.__line || data.__file) {
      let str = '[' + process.pid + '] ';
      str = (data.__file) ? str + data.__file : str ;
      str = (data.__line) ? str + ':' + data.__line : str ;
      for(let opt of ['err','msg']) {
        if(typeof data[opt] === 'undefined') { 
          continue;
        } else if(typeof data[opt] === 'object') {
          console.log(str);
          console.dir(data[opt]);
        } else {
          console.log(str + ' ' + data[opt]);
        }
      }
    } else if(data.stack) {
      console.log('[' + process.pid + '] \n' + data.stack);
    } else {
      console.log('[' + process.pid + ']');
      console.dir(data);
    }
  } else { // String
    console.log('[' + process.pid + '] ' + data);
    if(object) {
      console.dir(object);
    }
  }
};

module.exports.dbg = (data, object) => {
  if (prj.DEBUG_MODE) {
    module.exports.info(data, object);
  }
};

module.exports.ddbg = (obj) => {
  if (prj.DEBUG_MODE) {
    console.dir(obj);
  }
};

