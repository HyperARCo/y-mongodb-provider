import * as Y from 'yjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { MongodbPersistence } from '../src/y-mongodb.js';
import generateLargeText from './generateLargeText.js';

const storeDocWithText = async (mongodbPersistence, docName, content) => {
  const ydoc = new Y.Doc();
  // to wait for the update to be stored in the database before we check
  const updatePromise = new Promise((resolve) => {
    ydoc.on('update', async (update) => {
      await mongodbPersistence.storeUpdate(docName, update);
      resolve();
    });
  });

  const yText = ydoc.getText('name');
  yText.insert(0, content);

  // Wait for the update to be stored
  await updatePromise;
};

describe('meta with single collection', () => {
  let mongoServer;
  let mongodbPersistence;
  let mongoConnection;
  const docName = 'testDoc';
  const collectionName = 'testCollection';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongodbPersistence = new MongodbPersistence(mongoServer.getUri(), {
      collectionName,
    });
    mongoConnection = await MongoClient.connect(mongoServer.getUri(), {});
  });

  afterAll(async () => {
    if (mongodbPersistence) {
      await mongodbPersistence.destroy();
    }
    if (mongoConnection) {
      await mongoConnection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('should store meta data', async () => {
    const metaKey = 'testKey';
    const expectedValue = 'testValue';

    await mongodbPersistence.setMeta(docName, metaKey, expectedValue);

    // Check if meta data is stored in the database via the native mongo client
    const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();

    expect(count).toEqual(1);
  });

  it('should retrieve meta data', async () => {
    const metaKey = 'testKey';
    const expectedValue = 'testValue';

    const value = await mongodbPersistence.getMeta(docName, metaKey);
    expect(value).toEqual(expectedValue);
  });

  it('should delete meta data', async () => {
    const metaKey = 'testKey';

    await mongodbPersistence.delMeta(docName, metaKey);

    const value = await mongodbPersistence.getMeta(docName, metaKey);

    expect(value).toEqual(undefined);
  });
});

describe('store and retrieve updates in single collection with connection uri', () => {
  let mongoServer;
  let mongodbPersistence;
  let mongoConnection;
  const dbName = 'test';
  const docName = 'testDoc';
  const collectionName = 'testCollection';
  const content = 'Testtext';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const connectionStr = `${mongoServer.getUri()}${dbName}`;
    mongodbPersistence = new MongodbPersistence(connectionStr, {
      collectionName,
    });
    mongoConnection = await MongoClient.connect(connectionStr, {});
  });

  afterAll(async () => {
    if (mongodbPersistence) {
      await mongodbPersistence.destroy();
    }
    if (mongoConnection) {
      await mongoConnection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('should store updates', async () => {
    await storeDocWithText(mongodbPersistence, docName, content);

    // Check data is stored in the database via the native mongo client
    const db = mongoConnection.db(dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();

    // it will be two because one is the stateVector and the other is the update
    expect(count).toEqual(2);
  });

  it('should retrieve stored docs', async () => {
    const persistedYdoc = await mongodbPersistence.getYDoc(docName);

    const yText = persistedYdoc.getText('name');
    const yTextContent = yText.toString();

    expect(yTextContent).toEqual(content);
  });

  it('should store next update', async () => {
    const nextContent = 'NextTestText';

    await storeDocWithText(mongodbPersistence, docName, nextContent);

    const db = mongoConnection.db(dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();

    // it will be four because one is the stateVector and the other two are the updates
    expect(count).toEqual(3);
  });

  it("should flush document's updates", async () => {
    const db = mongoConnection.db(dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();

    // it will be four because one is the stateVector and the other two are the updates
    expect(count).toEqual(3);

    await mongodbPersistence.flushDocument(docName);

    const secondCount = await collection.countDocuments();
    expect(secondCount).toEqual(2);
  });
});

describe('store and retrieve updates in single collection with external MongoClient', () => {
  let mongoServer;
  let mongodbPersistence;
  let mongoClient;
  const dbName = 'test';
  const docName = 'testDoc';
  const collectionName = 'testCollection';
  const content = 'Testtext';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongoServer.getUri());
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    mongodbPersistence = new MongodbPersistence(
      { client: mongoClient, db },
      { collectionName },
    );
  });

  afterAll(async () => {
    if (mongodbPersistence) {
      await mongodbPersistence.destroy();
    }
    if (mongoClient) {
      await mongoClient.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('should store updates', async () => {
    await storeDocWithText(mongodbPersistence, docName, content);

    // Check data is stored in the database via the native mongo client
    const db = mongoClient.db(dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();

    // it will be two because one is the stateVector and the other is the update
    expect(count).toEqual(2);
  });

  it('should retrieve stored docs', async () => {
    const persistedYdoc = await mongodbPersistence.getYDoc(docName);

    const yText = persistedYdoc.getText('name');
    const yTextContent = yText.toString();

    expect(yTextContent).toEqual(content);
  });
});

describe('clearDocument with single collection', () => {
  let mongoServer;
  let mongodbPersistence;
  let mongoConnection;
  const docName = 'testDoc';
  const collectionName = 'testCollection';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongodbPersistence = new MongodbPersistence(mongoServer.getUri(), {
      collectionName,
    });
    mongoConnection = await MongoClient.connect(mongoServer.getUri(), {});
  });

  afterAll(async () => {
    if (mongodbPersistence) {
      await mongodbPersistence.destroy();
    }
    if (mongoConnection) {
      await mongoConnection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('should clear document', async () => {
    /* 1. Store Data */
    await storeDocWithText(mongodbPersistence, docName, 'blablabla');

    // Check data is stored in the database via the native mongo client
    const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();

    // it will be two because one is the stateVector and the other is the update
    expect(count).toEqual(2);

    /* 2. Clear data */
    await mongodbPersistence.clearDocument(docName);

    const secondCount = await collection.countDocuments();
    expect(secondCount).toEqual(0);
  });
});

describe('store multiple documents in single collection', () => {
  let mongoServer;
  let mongodbPersistence;
  let mongoConnection;
  const collectionName = 'testCollection';
  const docNameOne = 'testDocOne';
  const docNameTwo = 'testDocTwo';
  const contentOne = 'TestOne';
  const contentTwo = 'TestTwo';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongodbPersistence = new MongodbPersistence(mongoServer.getUri(), {
      collectionName,
    });
    mongoConnection = await MongoClient.connect(mongoServer.getUri(), {});
  });

  afterAll(async () => {
    if (mongodbPersistence) {
      await mongodbPersistence.destroy();
    }
    if (mongoConnection) {
      await mongoConnection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('should store two docs', async () => {
    const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
    const collection = db.collection(collectionName);

    /* Store first doc */
    await storeDocWithText(mongodbPersistence, docNameOne, contentOne);

    // Check data is stored in the database via the native mongo client
    const count = await collection.countDocuments();
    // it will be two because one is the stateVector and the other is the update
    expect(count).toEqual(2);

    /* Store second doc */
    await storeDocWithText(mongodbPersistence, docNameTwo, contentTwo);
    const countTwo = await collection.countDocuments();
    expect(countTwo).toEqual(4);
  });

  it('getAllDocNames should return all doc names', async () => {
    const docNames = await mongodbPersistence.getAllDocNames();
    expect(docNames).toEqual([docNameOne, docNameTwo]);
  });

  it('should clear document one', async () => {
    await mongodbPersistence.clearDocument(docNameOne);

    const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();
    expect(count).toEqual(2);
  });

  it('should clear document two', async () => {
    await mongodbPersistence.clearDocument(docNameTwo);

    const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();
    expect(count).toEqual(0);
  });
});

describe('store 40mb of data in single collection', () => {
  let mongoServer;
  let mongodbPersistence;
  let mongoConnection;
  const collectionName = 'testCollection';
  const docNameOne = 'docOne';
  const content = generateLargeText(40);

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongodbPersistence = new MongodbPersistence(mongoServer.getUri(), {
      collectionName,
    });
    mongoConnection = await MongoClient.connect(mongoServer.getUri(), {});
  });

  afterAll(async () => {
    if (mongodbPersistence) {
      await mongodbPersistence.destroy();
    }
    if (mongoConnection) {
      await mongoConnection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('should store 40mb of text in three documents', async () => {
    await storeDocWithText(mongodbPersistence, docNameOne, content);

    const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();
    expect(count).toEqual(3);
  });

  it("should retrieve the text of the stored document's updates", async () => {
    const persistedYdoc = await mongodbPersistence.getYDoc(docNameOne);

    const yText = persistedYdoc.getText('name');
    const yTextContent = yText.toString();

    expect(yTextContent.length).toEqual(content.length);
  });

  it("should clear the document's updates", async () => {
    await mongodbPersistence.clearDocument(docNameOne);

    const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();
    expect(count).toEqual(0);
  });
});

describe('document checkpoints', () => {
  let mongoServer;
  let mongodbPersistence;
  let mongoConnection;
  const collectionName = 'testCollection';
  const docName = 'testCheckpointDoc';
  const initialContent = 'Initial content';
  const secondContent = ' - Additional content';
  const thirdContent = ' - Final content';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongodbPersistence = new MongodbPersistence(mongoServer.getUri(), {
      collectionName,
    });
    mongoConnection = await MongoClient.connect(mongoServer.getUri(), {});
  });

  afterAll(async () => {
    if (mongodbPersistence) {
      await mongodbPersistence.destroy();
    }
    if (mongoConnection) {
      await mongoConnection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('should create a checkpoint at current state', async () => {
    // Store initial content
    await storeDocWithText(mongodbPersistence, docName, initialContent);

    // Create a checkpoint and get its clock
    const checkpoint = await mongodbPersistence.checkpoint(docName);

    // Verify checkpoint is a number
    expect(typeof checkpoint).toBe('number');

    // Check database contains the checkpoint document
    const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
    const collection = db.collection(collectionName);
    const checkpointDoc = await collection.findOne({
      docName,
      version: 'v1_checkpoint',
      clock: checkpoint,
    });

    expect(checkpointDoc).toBeTruthy();
  });

  it('should retrieve document at checkpoint state', async () => {
    // Get the initial document state and create a checkpoint
    const checkpoint1 = await mongodbPersistence.checkpoint(docName);

    // Add more content to the document
    const ydoc = await mongodbPersistence.getYDoc(docName);
    const yText = ydoc.getText('name');
    const updatePromise = new Promise((resolve) => {
      ydoc.on('update', async (update) => {
        await mongodbPersistence.storeUpdate(docName, update);
        resolve();
      });
    });

    yText.insert(yText.length, secondContent);
    await updatePromise;

    // Create another checkpoint
    const checkpoint2 = await mongodbPersistence.checkpoint(docName);

    // Add more content
    const ydoc2 = await mongodbPersistence.getYDoc(docName);
    const yText2 = ydoc2.getText('name');
    const updatePromise2 = new Promise((resolve) => {
      ydoc2.on('update', async (update) => {
        await mongodbPersistence.storeUpdate(docName, update);
        resolve();
      });
    });

    yText2.insert(yText2.length, thirdContent);
    await updatePromise2;

    // Retrieve document at different checkpoints
    const docAtCheckpoint1 = await mongodbPersistence.getYDoc(
      docName,
      checkpoint1,
    );
    const textAtCheckpoint1 = docAtCheckpoint1.getText('name').toString();
    expect(textAtCheckpoint1).toEqual(initialContent);

    const docAtCheckpoint2 = await mongodbPersistence.getYDoc(
      docName,
      checkpoint2,
    );
    const textAtCheckpoint2 = docAtCheckpoint2.getText('name').toString();
    expect(textAtCheckpoint2).toEqual(initialContent + secondContent);

    // Current document should have all content
    const currentDoc = await mongodbPersistence.getYDoc(docName);
    const currentText = currentDoc.getText('name').toString();
    expect(currentText).toEqual(initialContent + secondContent + thirdContent);
  });

  it('should handle invalid checkpoint gracefully', async () => {
    // Try to retrieve document with non-existent checkpoint
    const invalidCheckpoint = 999999;

    // Should fall back to latest version
    const doc = await mongodbPersistence.getYDoc(docName, invalidCheckpoint);

    // Document should still be accessible
    expect(doc).toBeTruthy();
    expect(doc.getText('name').toString()).toBeTruthy();
  });
});

describe('checkpoint retrieval after update squashing', () => {
  let mongoServer;
  let mongodbPersistence;
  let mongoConnection;
  const collectionName = 'testCollection';
  const docName = 'squashTestDoc';
  const initialContent = 'Initial content';
  const secondContent = ' - Additional content';

  // Set a small flushSize to trigger automatic squashing
  const flushSize = 3;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongodbPersistence = new MongodbPersistence(mongoServer.getUri(), {
      collectionName,
      flushSize: flushSize,
    });
    mongoConnection = await MongoClient.connect(mongoServer.getUri(), {});
  });

  afterAll(async () => {
    if (mongodbPersistence) {
      await mongodbPersistence.destroy();
    }
    if (mongoConnection) {
      await mongoConnection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('should preserve checkpoint state after document updates are squashed', async () => {
    // Store initial content
    await storeDocWithText(mongodbPersistence, docName, initialContent);

    // Create a checkpoint at initial state
    const checkpoint1 = await mongodbPersistence.checkpoint(docName);
    console.log({ checkpoint1 });

    // Verify database state
    const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
    const collection = db.collection(collectionName);

    // Should have state vector, update, and checkpoint documents
    let count = await collection.countDocuments({ docName });
    expect(count).toBeGreaterThanOrEqual(3);

    // Generate several small updates to trigger auto-squashing
    let ydoc = await mongodbPersistence.getYDoc(docName);

    console.log({ count1: await collection.countDocuments({ docName }) });

    // Make enough updates to trigger automatic squashing (flushSize + 1)
    console.log({ flushSize });
    for (let i = 0; i < flushSize + 1; i++) {
      console.log({ i });
      const updatePromise = new Promise((resolve) => {
        async function on(update) {
          const c = await mongodbPersistence.storeUpdate(docName, update);
          console.log({ c });

          ydoc.off('update', on);
          resolve();
        }

        ydoc.on('update', on);
      });

      // Add a character each time
      const yText = ydoc.getText('name');
      yText.insert(yText.length, i.toString());
      await updatePromise;
    }

    // Create another checkpoint after added content
    const checkpoint2 = await mongodbPersistence.checkpoint(docName);

    console.log({ checkpoint2 });

    console.log(await collection.find({}).toArray());

    // Refetch to trigger squashing
    ydoc = await mongodbPersistence.getYDoc(docName);

    // Verify squashing happened - the number of documents should be reduced
    const currentCount = await collection.countDocuments({
      docName,
      action: 'update',
    });
    console.log({ currentCount });

    // Count should be lower than the total number of updates we made
    // This confirms squashing occurred
    expect(currentCount).toBeLessThan(flushSize + 2); // +1 for original update + updates we made

    console.log(await collection.find({}).toArray());

    // Now retrieve document at first checkpoint
    const docAtCheckpoint1 = await mongodbPersistence.getYDoc(
      docName,
      checkpoint1,
    );
    const textAtCheckpoint1 = docAtCheckpoint1.getText('name').toString();

    // Should still have only the initial content, despite squashing
    expect(textAtCheckpoint1).toEqual(initialContent);

    // Add more content
    const finalYdoc = await mongodbPersistence.getYDoc(docName);
    const finalUpdatePromise = new Promise((resolve) => {
      finalYdoc.on('update', async (update) => {
        await mongodbPersistence.storeUpdate(docName, update);
        resolve();
      });
    });

    const yText = finalYdoc.getText('name');
    yText.insert(yText.length, secondContent);
    await finalUpdatePromise;

    // Force flush document to trigger squashing
    await mongodbPersistence.flushDocument(docName);

    // Verify we can still retrieve the checkpoint1 after an explicit flush
    const docAfterFlush = await mongodbPersistence.getYDoc(
      docName,
      checkpoint1,
    );
    const textAfterFlush = docAfterFlush.getText('name').toString();

    // Should still maintain the original content at checkpoint1
    expect(textAfterFlush).toEqual(initialContent);

    // Checkpoint2 should have initial content plus numeric updates, but not the final content
    const docAtCheckpoint2 = await mongodbPersistence.getYDoc(
      docName,
      checkpoint2,
    );
    const textAtCheckpoint2 = docAtCheckpoint2.getText('name').toString();

    // Should have initial content plus added numbers but not secondContent
    expect(textAtCheckpoint2).not.toEqual(initialContent);
    expect(textAtCheckpoint2.startsWith(initialContent)).toBeTruthy();
    expect(textAtCheckpoint2.includes(secondContent)).toBeFalsy();

    // Current document should have all content
    const currentDoc = await mongodbPersistence.getYDoc(docName);
    const currentText = currentDoc.getText('name').toString();
    expect(currentText.includes(secondContent)).toBeTruthy();
  });
});
