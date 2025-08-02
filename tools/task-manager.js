#!/usr/bin/env node

/**
 * Task Manager Tool
 * Manage scheduled tasks configuration and execution
 */

const fs = require('fs');
const path = require('path');

// Load task configuration
const configPath = path.join(__dirname, '../config/scheduled-tasks.json');
const taskConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

/**
 * Display all tasks
 */
function listTasks() {
  console.log('\n📋 Scheduled Tasks Configuration\n');
  console.log('='.repeat(80));
  
  taskConfig.tasks.forEach((task, index) => {
    const status = task.enabled ? '🟢 ENABLED' : '🔴 DISABLED';
    console.log(`${index + 1}. ${task.name} ${status}`);
    console.log(`   Description: ${task.description}`);
    console.log(`   Function: ${task.function} (${task.runtime})`);
    console.log(`   Schedule: ${task.schedule}`);
    console.log(`   Task Type: ${task.config.taskType}`);
    console.log(`   Timeout: ${task.config.timeout}s, Memory: ${task.config.memory}MB`);
    console.log('');
  });
  
  console.log(`Total: ${taskConfig.tasks.length} tasks (${taskConfig.tasks.filter(t => t.enabled).length} enabled)`);
}

/**
 * Enable/disable a task
 */
function toggleTask(taskName, enable) {
  const task = taskConfig.tasks.find(t => t.name === taskName);
  
  if (!task) {
    console.error(`❌ Task "${taskName}" not found`);
    return false;
  }
  
  const oldStatus = task.enabled;
  task.enabled = enable;
  
  // Save configuration
  fs.writeFileSync(configPath, JSON.stringify(taskConfig, null, 2));
  
  console.log(`✅ Task "${taskName}" ${enable ? 'enabled' : 'disabled'}`);
  console.log(`   Previous status: ${oldStatus ? 'enabled' : 'disabled'}`);
  console.log(`   New status: ${task.enabled ? 'enabled' : 'disabled'}`);
  
  return true;
}

/**
 * Show task details
 */
function showTask(taskName) {
  const task = taskConfig.tasks.find(t => t.name === taskName);
  
  if (!task) {
    console.error(`❌ Task "${taskName}" not found`);
    return;
  }
  
  console.log(`\n📊 Task Details: ${task.name}\n`);
  console.log('='.repeat(50));
  console.log(`Name: ${task.name}`);
  console.log(`Description: ${task.description}`);
  console.log(`Status: ${task.enabled ? '🟢 ENABLED' : '🔴 DISABLED'}`);
  console.log(`Function: ${task.function}`);
  console.log(`Runtime: ${task.runtime}`);
  console.log(`Schedule: ${task.schedule}`);
  console.log(`Task Type: ${task.config.taskType}`);
  console.log(`Task Name: ${task.config.taskName}`);
  console.log(`Timeout: ${task.config.timeout} seconds`);
  console.log(`Memory: ${task.config.memory} MB`);
  console.log('');
  console.log('Configuration:');
  console.log(JSON.stringify(task.config, null, 2));
}

/**
 * Validate configuration
 */
function validateConfig() {
  console.log('\n🔍 Validating Configuration\n');
  
  const errors = [];
  const warnings = [];
  
  // Check for duplicate task names
  const taskNames = taskConfig.tasks.map(t => t.name);
  const duplicates = taskNames.filter((name, index) => taskNames.indexOf(name) !== index);
  
  if (duplicates.length > 0) {
    errors.push(`Duplicate task names: ${duplicates.join(', ')}`);
  }
  
  // Check for valid schedules
  taskConfig.tasks.forEach(task => {
    if (!task.schedule) {
      errors.push(`Task "${task.name}" has no schedule`);
    }
    
    if (!task.schedule.startsWith('rate(') && !task.schedule.startsWith('cron(')) {
      warnings.push(`Task "${task.name}" has unusual schedule format: ${task.schedule}`);
    }
  });
  
  // Check for valid function references
  const functionNames = taskConfig.tasks.map(t => t.function);
  const uniqueFunctions = [...new Set(functionNames)];
  
  console.log(`✅ Found ${taskConfig.tasks.length} tasks`);
  console.log(`✅ Using ${uniqueFunctions.length} functions: ${uniqueFunctions.join(', ')}`);
  console.log(`✅ ${taskConfig.tasks.filter(t => t.enabled).length} tasks enabled`);
  
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(warning => console.log(`   ${warning}`));
  }
  
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(error => console.log(`   ${error}`));
    return false;
  }
  
  console.log('\n✅ Configuration is valid!');
  return true;
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
🛠️  Task Manager Tool

Usage: node tools/task-manager.js <command> [options]

Commands:
  list                    List all tasks
  show <task-name>        Show details for a specific task
  enable <task-name>      Enable a task
  disable <task-name>     Disable a task
  validate                Validate configuration
  help                    Show this help

Examples:
  node tools/task-manager.js list
  node tools/task-manager.js show python-task-1
  node tools/task-manager.js enable daily-summary
  node tools/task-manager.js disable nodejs-task-2
  node tools/task-manager.js validate
`);
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'list':
      listTasks();
      break;
      
    case 'show':
      if (args[1]) {
        showTask(args[1]);
      } else {
        console.error('❌ Please specify a task name');
        console.log('Usage: node tools/task-manager.js show <task-name>');
      }
      break;
      
    case 'enable':
      if (args[1]) {
        toggleTask(args[1], true);
      } else {
        console.error('❌ Please specify a task name');
        console.log('Usage: node tools/task-manager.js enable <task-name>');
      }
      break;
      
    case 'disable':
      if (args[1]) {
        toggleTask(args[1], false);
      } else {
        console.error('❌ Please specify a task name');
        console.log('Usage: node tools/task-manager.js disable <task-name>');
      }
      break;
      
    case 'validate':
      validateConfig();
      break;
      
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
      
    default:
      console.error('❌ Unknown command:', command);
      showHelp();
      process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  listTasks,
  showTask,
  toggleTask,
  validateConfig
}; 