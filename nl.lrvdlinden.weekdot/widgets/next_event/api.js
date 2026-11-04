'use strict';

module.exports = {
  async getData({ homey, query }) {
    return homey.app.widgetFeed('next_event', query || {});
  },
};
