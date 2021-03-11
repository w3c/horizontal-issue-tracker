const {Repository} = require("./github.js");


let db_cache;
function db(cached) {
  if (cached && db_cache) {
    return db_cache;
  }
  return (new Repository('whatwg/sg')).getContent('db.json')
    .then(res => JSON.parse(Buffer.from(res.data.content, res.data.encoding))).then(data => {
      if (cached) db_cache = data;
      return data;
    });
}

let streams_cache;
function workstreams(cached) {
  if (cached && streams_cache) {
    return streams_cache;
  }
  return db().then(data => {
      return data.workstreams.map(s => s.standards).flat();
    }).then(data => {
      if (cached) streams_cache = data;
      return data;
    });
}

module.exports = {
  db: db,
  workstreams: workstreams
}
