const Y = require('yjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const { MongodbPersistence } = require('../dist/y-mongodb.cjs');

describe('meta with single collection', () => {
	let mongoServer;
	let mongodbPersistence;
	let mongoConnection;
	const docName = 'testDoc';
	const collectionName = 'testCollection';

	beforeAll(async () => {
		mongoServer = await MongoMemoryServer.create();
		mongodbPersistence = new MongodbPersistence(mongoServer.getUri(), { collectionName });
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

describe('store and retrieve updates with single collection', () => {
	let mongoServer;
	let mongodbPersistence;
	let mongoConnection;
	const docName = 'testDoc';
	const collectionName = 'testCollection';
	const content = 'Testtext';

	beforeAll(async () => {
		mongoServer = await MongoMemoryServer.create();
		mongodbPersistence = new MongodbPersistence(mongoServer.getUri(), { collectionName });
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

	it('should store updates', async () => {
		await storeDocWithText(mongodbPersistence, docName, content);

		// Check data is stored in the database via the native mongo client
		const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
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

		const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
		const collection = db.collection(collectionName);
		const count = await collection.countDocuments();

		// it will be four because one is the stateVector and the other two are the updates
		expect(count).toEqual(3);
	});

	it("should flush document's updates", async () => {
		const db = mongoConnection.db(mongoServer.instanceInfo.dbName);
		const collection = db.collection(collectionName);
		const count = await collection.countDocuments();

		// it will be four because one is the stateVector and the other two are the updates
		expect(count).toEqual(3);

		await mongodbPersistence.flushDocument(docName);

		const secondCount = await collection.countDocuments();
		expect(secondCount).toEqual(2);
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
		mongodbPersistence = new MongodbPersistence(mongoServer.getUri(), { collectionName });
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
		mongodbPersistence = new MongodbPersistence(mongoServer.getUri(), { collectionName });
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
