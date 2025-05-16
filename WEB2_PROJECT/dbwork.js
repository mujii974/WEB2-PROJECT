const { MongoClient } = require('mongodb')


async function testmongo() {
    let client = new MongoClient('mongodb+srv://mujii974:mujtabashahid@cluster0.d7ihhxf.mongodb.net/')
    await client.connect()
    let db = client.db('project')
    let course = db.collection('fuel')
    let result = await course.find()
    let resultData = await result.toArray()
    console.log(resultData)
    client.close()
}

testmongo()