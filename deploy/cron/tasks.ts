/**
 * Cron job configurations
 * Manages all scheduled tasks and background jobs
 */
export function createCronJobs(linkables: { linkableValue: any }) {
  // Test task that runs every 2 minutes
  const testTaskCron = new sst.aws.Cron("TestTaskCron", {
    schedule: "rate(2 minutes)",
    function: {
      handler: "functions/src/functions/api.handler",
      runtime: "python3.11",
      link: [linkables.linkableValue],
      url: true,
    },
  });

  return {
    testTaskCron,
  };
}
