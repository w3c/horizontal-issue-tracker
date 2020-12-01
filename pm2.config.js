module.exports = {
  /**
   * Application configuration section
   * http://pm2.keymetrics.io/docs/usage/application-declaration/
   */
  apps : [
    {
      name      : 'horizontal-issue-tracker',
      script    : 'horizontal-task.js',
      env: {
        NODE_ENV: 'production'
      },
      error_file : "/var/log/nodejs/horizontal-issue-tracker.err",
      out_file : "/var/log/nodejs/horizontal-issue-tracker.log",
      "node_args": "--max_old_space_size=400"
    }
  ]
};
