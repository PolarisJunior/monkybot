const redis = require("redis");
const { promisify } = require("util");

module.exports = class Database {
  constructor() {
    this.client = redis.createClient();
    this.client.on("error", console.log);
    
    this.set = promisify(this.client.set).bind(this.client);
    this.get = promisify(this.client.get).bind(this.client);
  }
};
