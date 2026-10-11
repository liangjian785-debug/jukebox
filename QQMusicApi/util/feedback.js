const { dataPath } = require('../paths');
const jsonFile = require('jsonfile');

class Feedback {
  constructor() {
    try {
      this.data = jsonFile.readFileSync(dataPath('feedback.json'));
    } catch (err) {
      this.data = { list: [], updateTime: Date.now() };
      if (err.code === 'ENOENT') jsonFile.writeFileSync(dataPath('feedback.json'), this.data);
    }
  }

  add(val) {
    this.data.list.push(val);
    const time = new Date().getTime();
    val.id = Number(time * 100 + Math.floor(Math.random() * 100)).toString(36);
    this.data.updateTime = time;
    this.write();
  }

  write() {
    jsonFile.writeFileSync(dataPath('feedback.json'), this.data);
  }

  delete(id) {
    this.data.list.find(o => o.id === id).deleted = true;
    this.write();
  }

  edit({ id, content }) {
    this.data.list.find(o => o.id === id).content = content;
    this.write();
  }

  get({ pageNo = 1, pageSize = 20, desc = 1 }) {
    const { list } = this.data;
    let trueList = list.filter((o) => !o.deleted);
    if (!Number(desc)) {
      trueList.reverse();
    }
    const getList = trueList.slice((pageNo - 1) * pageSize, pageNo * pageSize);
    return {
      list: getList,
      total: trueList.length,
    }
  }
}

module.exports = Feedback;