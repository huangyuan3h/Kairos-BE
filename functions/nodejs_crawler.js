/**
 * Node.js Lambda function framework for scheduled tasks
 * Simple proof of concept implementation
 */

const AWS = require("aws-sdk");

// Configure AWS
const dynamodb = new AWS.DynamoDB.DocumentClient();
const tableName = process.env.MARKET_DATA_TABLE;

/**
 * Simple task 1: Log current timestamp
 */
function simpleTask1(event) {
  const timestamp = new Date().toISOString();
  console.log(`Task 1 executed at: ${timestamp}`);

  return {
    task_name: "simple_task_1",
    timestamp: timestamp,
    status: "completed",
    message: "Task 1 executed successfully",
  };
}

/**
 * Simple task 2: Echo back the event data
 */
function simpleTask2(event) {
  console.log(`Task 2 received event: ${JSON.stringify(event)}`);

  return {
    task_name: "simple_task_2",
    event_data: event,
    status: "completed",
    message: "Task 2 processed event data",
  };
}

/**
 * Save task execution result to DynamoDB
 */
async function saveTaskResult(taskName, result) {
  try {
    const timestamp = new Date().toISOString();

    const item = {
      pk: `task#${taskName}`,
      sk: timestamp,
      data: JSON.stringify(result),
      source: "nodejs_crawler",
      updated_at: timestamp,
      ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7 days TTL
    };

    await dynamodb
      .put({
        TableName: tableName,
        Item: item,
      })
      .promise();

    console.log(`Saved task result for ${taskName} to DynamoDB`);
  } catch (error) {
    console.error(`Error saving task result: ${error.message}`);
    throw error;
  }
}

/**
 * Main Lambda handler function
 */
exports.handler = async (event, context) => {
  try {
    console.log(`Received event: ${JSON.stringify(event)}`);

    // Extract task configuration from event
    const taskName = event.taskName || "unknown";
    const taskType = event.taskType || "simple_task_1";

    console.log(`Executing task: ${taskName} (type: ${taskType})`);

    // Execute task based on type
    let result;
    if (taskType === "simple_task_1") {
      result = simpleTask1(event);
    } else if (taskType === "simple_task_2") {
      result = simpleTask2(event);
    } else {
      console.warn(`Unknown task type: ${taskType}`);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Unknown task type: ${taskType}` }),
      };
    }

    // Save task result
    await saveTaskResult(taskName, result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Task ${taskName} executed successfully`,
        taskName: taskName,
        taskType: taskType,
        result: result,
      }),
    };
  } catch (error) {
    console.error(`Error in handler: ${error.message}`);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
