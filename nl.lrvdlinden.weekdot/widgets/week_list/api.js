'use strict';

module.exports = {
  async getData({ homey, query }) {
    return homey.app.widgetFeed('week_list', query || {});
  },
};
