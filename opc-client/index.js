const chalk = require('chalk');
const {
  OPCUAClient,
  MessageSecurityMode,
  SecurityPolicy,
  AttributeIds,
  ClientSubscription,
  TimestampsToReturn,
  ClientMonitoredItem,
} = require('node-opcua');
const insertToTableWithField = require('../database/insertToTableWithField');
const { logger, getToday } = require('../helpers');

async function lightWeightOPCClient({
  endpointUrl,
  nodeId,
  infinite = false,
  applicationName = 'MyApp',
  databaseConfigs = {
    host: '',
    user: '',
    password: '9121h23hui12h31jk23hjk12',
    database: '',
  },
  tableName = '',
  fieldName = '',
  timestampField = '',
  monitorTime = 10 * 1000,
}) {
  if (!endpointUrl || !nodeId) {
    throw Error('Please provide endpointUrl and nodeId');
  }
  let isInsertToDatabase = false;
  if (
    databaseConfigs.host !== '' &&
    databaseConfigs.user !== '' &&
    databaseConfigs.password !== '9121h23hui12h31jk23hjk12' &&
    databaseConfigs.database !== '' &&
    fieldName !== '' &&
    timestampField !== '' &&
    tableName !== ''
  ) {
    isInsertToDatabase = true;
  }
  const connectionStrategy = {
    initialDelay: 1000,
    maxRetry: 1,
  };
  const options = {
    applicationName,
    connectionStrategy,
    securityMode: MessageSecurityMode.None,
    securityPolicy: SecurityPolicy.None,
    endpointMustExist: true,
  };

  const client = OPCUAClient.create(options);
  await client.connect(endpointUrl);
  console.log(chalk.cyan('Connected to OPC!'));

  const session = await client.createSession();
  console.log('session created!');

  const value = 0;
  const nodeToRead = {
    nodeId,
    attributeId: AttributeIds.Value,
  };
  const dataValue = await session.read(nodeToRead, value);
  console.log('Value ', typeof dataValue.value);

  const subscription = ClientSubscription.create(session, {
    requestedPublishingInterval: 1000,
    requestedLifetimeCount: 100,
    requestedMaxKeepAliveCount: 10,
    maxNotificationsPerPublish: 100,
    publishingEnabled: true,
    priority: 10,
  });

  subscription
    .on('started', () => {
      console.log(
        'subscription started for 2 seconds - subscriptionId=',
        subscription.subscriptionId
      );
      if (isInsertToDatabase) {
        logger(chalk.bgGreen.white('The value will be stored to database.'));
        logger(chalk.green(`Host => ${databaseConfigs.host}`));
        logger(chalk.green(`Database => ${databaseConfigs.database}`));
        logger(chalk.green(`Fieldname => ${fieldName}`));
        logger(chalk.green(`Timestamp field => ${timestampField}`));
        logger(chalk.green(`Table name => ${tableName}`));
      }
    })
    .on('keepalive', () => {
      console.log(chalk.bgYellow.black('No value change occurs. Keep alive.'));
    })
    .on('terminated', () => {
      console.log('terminated');
      return null;
    });

  const itemToMonitor = {
    nodeId,
    attributeId: AttributeIds.Value,
  };
  const parameters = {
    samplingInterval: 100,
    discardOldest: true,
    queueSize: 10,
  };

  const monitoredItem = ClientMonitoredItem.create(
    subscription,
    itemToMonitor,
    parameters,
    TimestampsToReturn.Both
  );

  monitoredItem.on('changed', async (dValue) => {
    console.log(
      chalk.bgWhite.cyan(`[${getToday()}]`),
      chalk.bgCyan.black(`New value: ${dValue.value}`)
    );
    if (isInsertToDatabase) {
      try {
        const data = await insertToTableWithField({
          databaseConfigs,
          tableName,
          fieldName,
          value: dValue.value.value,
          timestampField,
        });
        console.log(data);
        console.log(
          chalk.bgGreen.white('Value was successfully inserted to database!')
        );
        console.log(
          chalk.white('--------------------------------------------')
        );
      } catch (error) {
        throw Error(error);
      }
    }
  });

  if (!infinite) {
    const timeout = async (ms) => {
      const promise = new Promise((resolve) => setTimeout(resolve, ms));
      return promise;
    };
    await timeout(monitorTime);

    console.log('now terminating subscription');
    await subscription.terminate();

    // close session
    await session.close();

    // disconnecting
    await client.disconnect();
    console.log('done !');
    return null;
  }
}

module.exports = lightWeightOPCClient;
