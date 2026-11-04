'use strict';

module.exports = {
  async getData({ homey, query }) {
    return homey.app.widgetFeed('week', query || {});
  },
};
