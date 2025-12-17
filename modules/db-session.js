const session = require("express-session");
const unsqh = require("./db");

class DBStore extends session.Store {
  constructor(options = {}) {
    super();
    this.table = options.table || "sessions";
  }

  get(sid, callback) {
    try {
      const session = unsqh.get(this.table, sid);
      callback(null, session || null);
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sessionData, callback) {
    try {
      unsqh.put(this.table, sid, sessionData);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      unsqh.delete(this.table, sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  touch(sid, sessionData, callback) {
    // optional: update expiration without overwriting
    try {
      unsqh.update(this.table, sid, sessionData);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = DBStore;
