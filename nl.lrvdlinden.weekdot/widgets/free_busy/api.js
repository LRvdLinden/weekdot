'use strict';

module.exports = {
  async getData({ homey, query }) {
    return homey.app.widgetFeed('free_busy', query || {});
  },
};
