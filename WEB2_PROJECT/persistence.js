const fs = require("fs/promises");
const { MongoClient } = require("mongodb");
const mongodb = require("mongodb");
const crypto = require("crypto");


// SESSION DATA

let client = undefined;
let project = undefined;
let deliveries = undefined;
let stations = undefined;
let users = undefined;
let session = undefined;

async function connectDatabase() {
  if (!client) {
    client = new mongodb.MongoClient(
      "mongodb+srv://mujii974:mujtabashahid@cluster0.d7ihhxf.mongodb.net/"
    );
    await client.connect();
    project = client.db("project");
    deliveries = project.collection("deliveries");
    fuel = project.collection("fuel");
    records = project.collection("records");
    sales = project.collection("sales");
    stations = project.collection("stations");
    users = project.collection("users");
    session = project.collection("session");
  }
}

async function getUser(uid) {  // retrieve user info based on uid
  await connectDatabase();
  let result = users.findOne({ userId: uid });
  return result;
}

async function startSession(data) { // creates a new session for the user
  const sessionKey = crypto.randomUUID();   // Generate a random UUID for the session key
  const created = new Date();   // Get the current date and time
  const expiry = new Date(created.getTime() + 1000 * 60 * 60);  // Calculate the expiry date and time (1 hour from now)
  let sessionData = {
    data: data,
    sessionKey: sessionKey,
    expiry: expiry,
  };
  await connectDatabase();
  project = client.db("project");
  session = project.collection("session");
  await session.insertOne(sessionData);
  return sessionKey;
}

async function saveSession(uuid, data) {
  await connectDatabase();
  await session.insertOne({
    sessionKey: uuid,
    Data: data,
  });
}

async function getSession(key) {
  await connectDatabase();
  return await session.findOne({ sessionKey: key });
}

async function updateSession(key, data) {
  await connectDatabase();
  await session.replaceOne({ sessionKey: key }, data);
}

async function terminateSession(key) {
  await connectDatabase();
  await session.deleteOne({ sessionKey: key });
}

async function validateSession(key) {
  await connectDatabase();
  let result = await session.findOne({ sessionKey: key });
  return result;
}

async function checkEmail(email) {  // checks if the email exists in the database
  await connectDatabase()
  let result = await users.findOne({ email: email })
  return result
}

async function updateCollection(checkEmail) { // updates user data in the database
  await connectDatabase()
  let email = checkEmail.email
  await users.replaceOne({ email: email }, checkEmail)
}

async function modifyCollection(key, email) { // handles modification of user data, like updating a reset key
  email.resetKey = key
  await updateCollection(email)
}

async function getUserKey(key) {  // Retrieves a user data based on their reset key
  await connectDatabase()
  let result = await users.findOne({resetKey:key})
  return result
}

async function removeResetKey(key) { // Removes the reset key from a user's record and updates their data
  try {
      let Key = key.replace(/=/g, '');
      let user = await getUserKey(Key);
      let userUp = {
          username: user.username,
          password: user.password,
          email: user.email,
          accountType: user.accountType,
          stationId: user.stationId,
          userId: user.userId
      }
      await updateCollection(userUp); // update user data in database
  } catch (error) {
      console.error(`Error deleting reset key from users: ${error.message}`);
      throw error;
  }
}

async function readUsers() {
  await connectDatabase();
  return await users.find().toArray();
}

async function readStations() {
  await connectDatabase();
  return await stations.find().toArray();
}

async function writeStations(stationsData) {  // This function is used to write (or update) station record in the database
  await connectDatabase();
  for (const stationData of stationsData) {
    await stations.updateOne(
      { stationId: stationData.stationId },
      { $set: stationData },
      { upsert: true }
    );
  }
  return true;
}

async function readRecords() {
  await connectDatabase();
  return await records.find().toArray();
}

async function writeRecords(records) { // This function is used to write (or update) multiple sales records in the database
  await connectDatabase();
  for (const recordData of records) {
    await records.updateOne(
      { recordId: recordData.recordId },
      { $set: recordData },
      { upsert: true }
    );
  }
  return true;
}

async function getData1(stationId) {
  // Retrieve sales records from the persistence layer
  let data = await project.collection("records").find().toArray();

  // Filter records by stationId and fuelType
  let premiumData = data.filter(
    (record) => record.stationId === stationId && record.fuelType === "premium"
  );
  let superData = data.filter(
    (record) => record.stationId === stationId && record.fuelType === "super"
  );

  // Extract salesTotal and date from each record
  let premiumSales = premiumData.map((record) => ({sales: record.salesTotal, date: record.date}));
  let superSales = superData.map((record) => ({sales: record.salesTotal, date: record.date}));

  // Return the result arrays
  return {
    premium: premiumSales,
    super: superSales,
  };
}

// FUEL MANAGEMENT FUNCTIONS
async function updatePremiumFuelLevel(stationId, fuelLevel) { 
  try {
    await connectDatabase();

    // Find the station with the given stationId
    const station = await project.collection("stations").findOne({ stationId: stationId });

    if (station) {
      // Update the premium fuel level for the station
      station.currentFuelLevels.premium += fuelLevel;

      // Write the updated station data back to the database
      await project.collection("stations").updateOne(
        { stationId: station.stationId },
        { $set: station }
      );

      // Return success message or any other relevant data
      return {
        success: true,
        message: "Premium fuel level updated successfully",
      };
    } else {
      throw new Error("Station not found");
    }
  } catch (error) {
    // Handle any errors that occur during the update process
    console.error("Error updating premium fuel level:", error);
    throw new Error("Failed to update premium fuel level");
  }
}

async function updateSuperFuelLevel(stationId, fuelLevel) {
  try {
    await connectDatabase();

    // Find the station with the given stationId
    const station = await project.collection("stations").findOne({ stationId: stationId });

    if (station) {
      // Update the super fuel level for the station
      station.currentFuelLevels.super += fuelLevel;

      // Write the updated station data back to the database
      await project.collection("stations").updateOne(
        { stationId: station.stationId },
        { $set: station }
      );

      // Return success message or any other relevant data
      return {
        success: true,
        message: "Super fuel level updated successfully",
      };
    } else {
      throw new Error("Station not found");
    }
  } catch (error) {
    // Handle any errors that occur during the update process
    console.error("Error updating super fuel level:", error);
    throw new Error("Failed to update super fuel level");
  }
}

async function recordFuelDelivery(userId, stationId, fuelType, fuelAmount, enteredDate) { 
  await connectDatabase();
  // updates or creates a new record for fuel delivery
  // Define the filter for the document to update
  const filter = {
    id: userId,
    date: new Date(enteredDate),
    fuelType: fuelType,
    stationId: stationId,
  };

  // Define the update operation
  const update = {
    $inc: { litersDelivered: fuelAmount },
  };

  // Define the options for the update operation
  const options = {
    upsert: true, // create a new document if no documents match the filter
  };

  // Update the document in the deliveries collection
  await project.collection("deliveries").updateOne(filter, update, options);

  return { success: true, message: "Fuel delivery recorded successfully" };
}

async function recordSalesAndFuelAvailability(
  userId,
  stationId,
  date,
  salesTotal,
  fuelType
) {
// records sales data and updates fuel capacity. 
// It calculates liters sold based on sales total and fuel price, 
// connects to the database, and then updates or creates a new record 
// with sales and fuel data for a specific station, date, and fuel type.

  const fuelPrice = await getCurrentFuelPrice(stationId, fuelType);
  const litersSold = calculateLitersSold(salesTotal, fuelPrice);
  await connectDatabase();

  // Define the filter for the document to update
  const filter = {
    id: userId,
    stationId: stationId,
    date: date,
    fuelType: fuelType
  };

  // Define the update operation
  const update = {
    $inc: { 
      salesTotal: salesTotal,
      litersSold: litersSold
    }
  };

  // Define the options for the update operation
  const options = {
    upsert: true, // create a new document if no documents match the filter
  };

  // Update the document in the records collection
  await project.collection("records").updateOne(filter, update, options);

  return {
    success: true,
    message: "Sales data and fuel availability recorded successfully",
  };
}

async function getCurrentFuelPrice(stationId, fuelType) {
  await connectDatabase();

  // Find the station with the given stationId
  const specificStation = await project.collection("stations").findOne({ stationId: stationId });

  // If the station is found, check the fuelType and return the corresponding fuel price
  if (specificStation) {
    if (fuelType === "premium") {
      return specificStation.fuelPricePremium;
    } else if (fuelType === "super") {
      return specificStation.fuelPriceSuper;
    } else {
      console.error("Invalid fuel type");
      throw new Error("Failed to get current fuel price");
    }
  } else {
    console.error("Station not found");
    throw new Error("Failed to get current fuel price");
  }
}

function calculateLitersSold(salesTotal, fuelPrice) {
  let litersSold = salesTotal / fuelPrice;

  // Round off litersSold to 2 decimal places
  litersSold = parseFloat(litersSold.toFixed(2));

  return litersSold;
}

async function deductPremiumFuelLevel(stationId, litersSold) {
  try {
    await connectDatabase();

    // Find the station with the given stationId
    const station = await project.collection("stations").findOne({ stationId: stationId });

    if (station) {
      // Deduct the sold liters from the premium fuel level for the station
      station.currentFuelLevels.premium -= litersSold;

      // Write the updated station data back to the database
      await project.collection("stations").updateOne(
        { stationId: station.stationId },
        { $set: station }
      );

      // Return success message or any other relevant data
      return {
        success: true,
        message: "Premium fuel level updated successfully",
      };
    } else {
      throw new Error("Station not found");
    }
  } catch (error) {
    // Handle any errors that occur during the update process
    console.error("Error updating premium fuel level:", error);
    throw new Error("Failed to update premium fuel level");
  }
}

async function deductSuperFuelLevel(stationId, litersSold) {
  try {
    await connectDatabase();

    // Find the station with the given stationId
    const station = await project.collection("stations").findOne({ stationId: stationId });

    if (station) {
      // Deduct the sold liters from the super fuel level for the station
      station.currentFuelLevels.super -= litersSold;

      // Write the updated station data back to the database
      await project.collection("stations").updateOne(
        { stationId: station.stationId },
        { $set: station }
      );

      // Return success message or any other relevant data
      return {
        success: true,
        message: "Super fuel level updated successfully",
      };
    } else {
      throw new Error("Station not found");
    }
  } catch (error) {
    // Handle any errors that occur during the update process
    console.error("Error updating super fuel level:", error);
    throw new Error("Failed to update super fuel level");
  }
}

async function getDeliveryRecords() { // retrieves fuel delivery records from the database
  await connectDatabase();
  const project = client.db("project");
  const deliveryRecords = project.collection("records");
  const data = await deliveryRecords.find({}).toArray();

  // Extract fuelType and litersSold for each record
  const extractedData = data.map((record) => ({
    fuelType: record.fuelType,
    litersSold: record.salesTotal,
  }));
  return extractedData;
}

async function readDeliveries() {
  await connectDatabase();
  return await deliveries.find().toArray();
}

async function writeDeliveries(deliveries) { // writes or updates fuel delivery record to the database
  await connectDatabase();
  for (const deliveryData of deliveries) {
    await project.collection("deliveries").updateOne(
      { deliveryId: deliveryData.deliveryId },
      { $set: deliveryData },
      { upsert: true }
    );
  }
  return true;
}

// STATION MANAGEMENT FUNCTIONS
async function deleteStation(stationId) {
  try {
    stationId = parseInt(stationId);
    await connectDatabase();
    const result = await stations.deleteOne({ stationId: stationId });

    if (result.deletedCount === 1) { // Checks if the station was deleted
      return { success: true, message: "Station deleted successfully." };
    } else {
      return { success: false, message: "Station not found." };
    }
  } catch (error) {
    console.error(error);
    return { success: false, message: "Failed to delete station." };
  }
}

async function updateStationName(stationId, newName) {
  try {
    stationId = parseInt(stationId);  // Parse the stationId to an integer
    await connectDatabase();
    const result = await stations.updateOne(
      { stationId: stationId }, // Filter: find a station with the same stationId
      { $set: { name: newName } } // Update: set the name of the station to the new name
    );

    if (result.matchedCount === 1) {
      return true;
    } else {
      return false; // Station not found
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function addStation(name, location, fuelPricePremium, fuelPriceSuper, currentFuelLevelsPremium, currentFuelLevelsSuper) {
  try {
    await connectDatabase();
    const maxStationId = await stations.find().sort({stationId: -1}).limit(1).toArray(); // Find the station with the highest stationId
    const newStationId = maxStationId[0].stationId + 1; // Calculate the stationId for the new station by adding 1 to the highest stationId


    const newStation = {
      stationId: newStationId,
      name,
      location,
      fuelPricePremium: Number(fuelPricePremium),
      fuelPriceSuper: Number(fuelPriceSuper),
      currentFuelLevels: {
        premium: Number(currentFuelLevelsPremium),
        super: Number(currentFuelLevelsSuper),
      },
    };

    await stations.insertOne(newStation);

    return { success: true, message: "Station added successfully." };
  } catch (error) {
    console.error(error);
    return { success: false, message: "Failed to add station." };
  }
}

// USER MANAGEMENT FUNCTIONS
async function updateUserStation(userId, newStationId) { // updates the station of a user
  try {
    userId = Number(userId);
    newStationId = Number(newStationId);
    await connectDatabase();
    const userUpdateResult = await users.updateOne(
      { userId: userId }, // Filter: find a user with the same userId
      { $set: { stationId: newStationId } } // Update: set the stationId of the user to the new stationId
    );

    if (userUpdateResult.matchedCount === 1) {
      // Find the old station and remove the userId
      const oldStationUpdateResult = await stations.updateOne(
        { userId: userId },
        { $unset: { userId: "" } }
      );

      // Assign the new station to the user
      const newStationUpdateResult = await stations.updateOne(
        { stationId: newStationId },
        { $set: { userId: userId } }
      );

      if (newStationUpdateResult.matchedCount === 1) {
        return true;
      } else {
        console.log(`Station with ID ${newStationId} not found.`);
        return false;
      }
    } else {
      console.log(`User with ID ${userId} not found.`);
      return false; // User not found
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function removeUser(userId) { // removes a user from the database
  try {
    userId = Number(userId);
    await connectDatabase();
    const userDeleteResult = await users.deleteOne({ userId: userId });

    if (userDeleteResult.deletedCount === 1) { // Check if the user was deleted
      // Remove the userId from the station
      const stationUpdateResult = await stations.updateOne(
        { userId: userId },
        { $unset: { userId: "" } }
      );

      return true;
    } else {
      return false; // User not found
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function createUser(username, password, accountType) {
  try {
    await connectDatabase();
    const maxUserId = await users.find().sort({userId: -1}).limit(1).toArray();
    const newUserId = maxUserId[0].userId + 1;

    const newUser = {
      username: username,
      password: password,
      accountType: accountType,
      userId: newUserId,
    };

    if (accountType === "manager") {
      const stationsData = await stations.find().toArray();

      // Find a station that does not have an assigned userId
      const stationIndex = stationsData.findIndex((station) => !station.userId);

      if (stationIndex !== -1) {
        // Assign the stationId to the new user
        newUser.stationId = stationsData[stationIndex].stationId;

        // Create a new station object with the properties in the desired order
        const updatedStation = {
          stationId: stationsData[stationIndex].stationId,
          userId: newUser.userId,
          name: stationsData[stationIndex].name,
          location: stationsData[stationIndex].location,
          fuelPricePremium: stationsData[stationIndex].fuelPricePremium,
          fuelPriceSuper: stationsData[stationIndex].fuelPriceSuper,
          currentFuelLevels: stationsData[stationIndex].currentFuelLevels,
        };

        // Replace the old station data with the updated station data
        await stations.updateOne(
          { stationId: stationsData[stationIndex].stationId },
          { $set: updatedStation }
        );
      }
    }

    // Add the new user to the users collection
    await users.insertOne(newUser);

    return newUser;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function updateUser(userId, updatedUserData) {
  try {
    userId = Number(userId);
    await connectDatabase();
    const userUpdateResult = await users.updateOne(
      { userId: userId },
      { $set: updatedUserData }
    );

    if (userUpdateResult.matchedCount === 1) {
      return true;
    } else {
      return false; // User not found
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

module.exports = {
  getUser,
  startSession,
  saveSession,
  getSession,
  updateSession,
  terminateSession,
  validateSession,
  checkEmail,
  updateCollection,
  modifyCollection,
  getUserKey,
  removeResetKey,
  readUsers,
  readStations,
  writeStations,
  readRecords,
  writeRecords,
  getData1,
  updatePremiumFuelLevel,
  updateSuperFuelLevel,
  recordFuelDelivery,
  recordSalesAndFuelAvailability,
  deductPremiumFuelLevel,
  deductSuperFuelLevel,
  getDeliveryRecords,
  readDeliveries,
  writeDeliveries,
  deleteStation,
  updateStationName,
  addStation,
  updateUserStation,
  removeUser,
  createUser,
  updateUser
};