const { get } = require("http");
const persistence = require("./persistence");
const crypto = require("crypto");
const nodemailer = require('nodemailer')


// SESSION DATA
async function getUser(uid) {
  return await persistence.getUser(uid);
}

async function startSession(data) {
  return await persistence.startSession(data);
}

async function getSession(key) {
  return await persistence.getSession(key);
}

async function updateSession(key, data) {
  return await persistence.updateSession(key, data);
}

async function terminateSession(key) {
  if (!key) {
    return;
  }
  await persistence.terminateSession(key);
}

async function validateSession(key) {
  if (!key) {
    return;
  }
  return await persistence.validateSession(key);
}

async function readUsers() {
  return await persistence.readUsers();
}

async function readStations() {
  return await persistence.readStations();
}

async function writeStations(stations) {
  return await persistence.writeStations(stations);
}

async function readDeliveries() {
  return await persistence.readDeliveries();
}

async function readRecords() {
  return await persistence.readRecords();
}

async function writeRecords(records) {
  return await persistence.writeRecords(records);
}

async function generateFormToken(key){ // Generates a CSRF token for form submissions.
  let token = Math.floor(Math.random()*1000000)
  let sessionData = await persistence.getSession(key)
  sessionData.csrfToken = token
  await persistence.updateSession(key,sessionData)
  return token
}

async function cancelToken(key){ // Cancels or invalidates a previously generated CSRF token
  let sessionData = await persistence.getSession(key)
  delete sessionData.csrfToken
  await persistence.updateSession(key,sessionData)
}


// EMAIL
async function testMail(email, key) { // This function is used to send a password reset email
  let transporter = nodemailer.createTransport({   // Create a transporter object using nodemailer,used to send emails
      host: "127.0.0.1",
      port: 25
  })
  let link = `http://127.0.0.1:9000/reset-password/${key}` // Create link to reset password
  let mssg = `Dear user, please click the link below to reset your password.
  ${link}
  `
  await transporter.sendMail({
      from: email,
      to: "admin@psmanagement.com",
      subject: "Password Reset",
      html: mssg
  })
}

async function generateKey() {
  let key = crypto.randomUUID()
  return key
}

async function checkEmail(email) {
  return await persistence.checkEmail(email)
}

async function modifyCollection(key, email) {
  return await persistence.modifyCollection(key, email)
}

async function validateKey(key) { // Validate a reset key
  try {
  let Key = key.replace(/=/g, '');  // Remove all equals signs from the key
  let user = await persistence.getUserKey(Key); // Retrieve the user from the database using the modified key
  return user;
  } catch (error) {
  console.error(`Error validating reset key: ${error.message}`);
  throw error;
  }
}

async function changePassword(key, pass) { // Change the password of a user using a reset key
  try {
      let Key = key.replace(/=/g, ''); // Remove all equals signs from the key
      let user = await persistence.getUserKey(Key); // Retrieve the user from the database using the modified key

      var hash = crypto.createHash('sha256')
      hash.update(pass)
      let result = hash.digest('hex')

      user.password = result; // Update the user's password with the hashed password
      await persistence.updateCollection(user);
      return true;
  } catch (error) {
      console.error(`Error updating password by reset key: ${error.message}`);
      throw error;
  }
}

async function removeResetKey(key) {
  return persistence.removeResetKey(key);
}


// ADMIN
async function setStationLocation(stationId, location) { // Set the location of a station
  try {
    await updateStationLocation(stationId, location);
    return { success: true, message: "Location updated successfully." };
  } catch (error) {
    console.error(error);
    return { success: false, message: "Failed to update location." };
  }
}

async function updateStationLocation(stationId, location) { // Update the location of a station
  try {
    stationId = parseInt(stationId);  // Parse the stationId to an integer
    const stations = await persistence.readStations();
    // Find the index of the station with the matching stationId
    const stationIndex = stations.findIndex((s) => s.stationId === stationId);

    // If a station with the given stationId exists
    if (stationIndex !== -1) {
      stations[stationIndex].location = location;
      await writeStations(stations);

      return { success: true, message: "Location updated successfully." };
    } else {
      throw new Error("Station not found");
    }
  } catch (error) {
    console.error(error);
    return { success: false, message: "Failed to update location." };
  }
}

async function updatePremiumFuelPrice(stationId, fuelPrice) { // Update the premium fuel price of a station
  try {
    const stations = await readStations();

    // Find the index of the station with the matching stationId
    const stationIndex = stations.findIndex((s) => s.stationId === stationId);

    if (stationIndex !== -1) {
      stations[stationIndex].fuelPricePremium = fuelPrice;
      await writeStations(stations);

      return {
        success: true,
        message: "Premium fuel price updated successfully",
      };
    } else {
      throw new Error("Station not found");
    }
  } catch (error) {
    console.error("Error updating premium fuel price:", error);
    throw new Error("Failed to update premium fuel price");
  }
}


async function updateSuperFuelPrice(stationId, fuelPrice) { // Updates the super fuel price of a station
  try {
    const stations = await readStations();

    // Find the index of the station with the matching stationId
    const stationIndex = stations.findIndex((s) => s.stationId === stationId);

    if (stationIndex !== -1) {
      stations[stationIndex].fuelPriceSuper = fuelPrice;
      await writeStations(stations);

      return {
        success: true,
        message: "Super fuel price updated successfully",
      };
    } else {
      throw new Error("Station not found");
    }
  } catch (error) {
    console.error("Error updating super fuel price:", error);
    throw new Error("Failed to update super fuel price");
  }
}

async function deleteStation(stationId) {
  return await persistence.deleteStation(stationId);
}

async function updateStationName(stationId, newName) {
  return await persistence.updateStationName(stationId, newName);
}

async function addStation(name, location, fuelPricePremium, fuelPriceSuper, currentFuelLevelsPremium, currentFuelLevelsSuper) {
  return await persistence.addStation(name, location, fuelPricePremium, fuelPriceSuper, currentFuelLevelsPremium, currentFuelLevelsSuper);
}

async function updateUserStation(userId, newStationId) {
  return await persistence.updateUserStation(userId, newStationId);
}

async function removeUser(userId){
  return await persistence.removeUser(userId);
}

async function createUser(username, password, accountType) {
  return await persistence.createUser(username, password, accountType);
}

async function updateUser(userId, updatedUserData) {
  return await persistence.updateUser(userId, updatedUserData);
}


// MANAGER
async function getData1(stationId) {
  return await persistence.getData1(stationId);
}

async function updatePremiumFuelLevel(stationId, fuelLevel) {
  return await persistence.updatePremiumFuelLevel(stationId, fuelLevel);
}

async function updateSuperFuelLevel(stationId, fuelLevel) {
  return await persistence.updateSuperFuelLevel(stationId, fuelLevel);
}

async function recordFuelDelivery(userId, stationId, fuelType, fuelAmount, enteredDate) {
  return await persistence.recordFuelDelivery(userId, stationId, fuelType, fuelAmount, enteredDate);
}

async function recordSalesAndFuelAvailability(
  userId,
  stationId,
  date,
  salesTotal,
  fuelType
) {
  return await persistence.recordSalesAndFuelAvailability(userId, stationId, date, salesTotal, fuelType);
}

async function deductPremiumFuelLevel(stationId, litersSold) {
  return await persistence.deductPremiumFuelLevel(stationId, litersSold);
}

async function deductSuperFuelLevel(stationId, litersSold) {
  return await persistence.deductSuperFuelLevel(stationId, litersSold);
}


module.exports = {
  getUser,
  startSession,
  getSession,
  updateSession,
  terminateSession,
  validateSession,
  readUsers,
  readStations,
  readDeliveries,
  readRecords,
  writeRecords,
  generateFormToken,
  cancelToken,

  testMail,
  generateKey,
  checkEmail,
  modifyCollection,
  validateKey,
  changePassword,
  removeResetKey,

  setStationLocation,
  updatePremiumFuelPrice,
  updateSuperFuelPrice,
  deleteStation,
  updateStationName,
  addStation,
  updateUserStation,
  removeUser,
  createUser,
  updateUser,

  getData1,
  updatePremiumFuelLevel,
  updateSuperFuelLevel,
  recordFuelDelivery,
  recordSalesAndFuelAvailability,
  deductPremiumFuelLevel,
  deductSuperFuelLevel,
};