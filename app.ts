import Homey from "homey";

class GoodWeApp extends Homey.App {
  async onInit() {
    this.log("App GoodWe has been initialized");
  }
}

module.exports = GoodWeApp;
