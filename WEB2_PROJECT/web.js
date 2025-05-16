const business = require("./business.js");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname + "/static"));

const flash = require("./flash.js");

const crypto = require("crypto");

const handlebars = require("express-handlebars");
app.set("views", __dirname + "/templates");
app.set("view engine", "handlebars");
app.engine("handlebars", handlebars.engine());

const cookieParser = require("cookie-parser");
app.use(cookieParser());

const fileUpload = require("express-fileupload");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
app.use(fileUpload());

// Helper function to format the fuel level to 2 decimal places
function formatLevel(level) {
  if (typeof level === 'number') {
    return level.toFixed(2);
  } else {
    // Provide a default value if level is not a number
    return '0.00';
  }
}

// Helper function to increment the index
function incrementIndex(index) {
  return index + 1;
}

// Use 127.0.0.1:9000/public

// npm install express
// npm install express-handlebars
// npm install cookie-parser
// npm install mongodb
// npm install crypto
// npm install express-fileupload
// If the sharp module is not defined, delete the sharp module (node_modules > sharp)
// and then install it again
// npm install sharp
// npm install nodemailer

// LOGIN PAGE
app.get("/login", async (req, res) => {
  const sessionKey = req.cookies.session;   // Retrieve the session key from the cookies
  if (sessionKey) {
    const session = await business.getSession(sessionKey); // Retrieve the session data using the session key
    if (session) {
      const userInfo = session.data;
      let user = await business.getUser(userInfo.userId); // Retrieve the user from the database using the user ID from the session data
      if (user.user === userInfo.user && user.password === userInfo.password) {
        if (user.accountType === "admin") {
          res.redirect(`/admin/${username}`);
          return;
        } else if (user.accountType === "manager") {
          res.redirect(`/manager/${username}`);
          return;
        }
      }
    }
  }

  res.clearCookie("session");

  res.render("login", {
    layout: undefined,
  });
});

app.post("/login", async (req, res) => { // Handle the login request
  let username = req.body.username;
  let password = req.body.password;

  // Hash the entered password
  let hash = crypto.createHash('sha256');
  hash.update(password);
  let hashedPassword = hash.digest('hex')

  let users = await business.readUsers();
  let msg;
  let user = users.find(
    (user) => user.username === username && user.password === hashedPassword
  ); // Find the user in the database using the username and hashed password

  if (user) { 
    if (user.accountType === "admin") {
      let session = await business.startSession(user);
      res.cookie("session", session);
      await flash.setFlash(session, "Logged in!");
      res.redirect(`/admin/${username}`);
      return;
    } else if (user.accountType === "manager") {
      let session = await business.startSession(user);
      res.cookie("session", session);
      res.redirect(`/manager/${username}`); 
      return;
    }
  } else {
    let session = await business.startSession({ email: "" });
    await flash.setFlash(session, "INVALID CREDENTIALS!");
    msg = await flash.getFlash(session);
    await business.terminateSession(session);
    res.clearCookie("session");
  }

  res.render("login", {
    layout: undefined,
    error: msg,
  });
});

app.get("/logout", async (req, res) => {
  let key = req.cookies.session;
  let del = await business.getSession(key);
  if (del) {
    await business.terminateSession(key);
  }
  if (key) {
    res.clearCookie("session");
  }
  res.redirect("/login");
  return;
});

app.post('/forgot-password', async (req, res) => { // Handle the forgot password request
  res.render('password-reset',{layout: undefined})
})  

app.post('/password-reset', async (req, res) => { // Handle the password reset request
  let email = req.body.email
  let checkEmail = await business.checkEmail(email) // Check if the email exists in the database
  if (checkEmail) {
      let key = await business.generateKey()
      await business.modifyCollection(key, checkEmail) // Store the key in the database associated with the email
      await business.testMail(email, key) // Send a password reset email to the user with the unique key
      res.redirect('/login?message="Please check your email to be able to reset your password."')
  }
  else {
      res.redirect('/login?message="Sorry! The email was not found!"')
  }
})

app.get('/reset-password/:key', async(req,res)=>{ 
  let key = req.params.key
  let user = await business.validateKey(key)
  if (user){
      res.render('reset-password',{layout: undefined, message: 'Please enter your new password', key : key})
  }
  else{
      res.redirect("/?message=Error while resetting password! Please try again!")
  }
})

app.post('/reset-password/:key', async (req, res) => {
  let key = req.params.key
  let newPass = req.body.newPass
  let confirmPass = req.body.confirmPass

  if (newPass != confirmPass){
      return res.redirect(`/reset-password/${key}?message=Passwords do not match`) // If the passwords don't match, it redirects back to the reset password page with an error message.
  }else{
      let result = await business.changePassword(key,newPass)
      if(result){
        await business.removeResetKey(key)
        res.redirect('/login?message=Password has been changed!')
      }
  }
})


// ADMIN VIEW
// Stations
app.get("/admin/:username", async (req, res) => { 
  const sessionKey = req.cookies.session; 
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data;
      let stations = await business.readStations();
      let users = await business.readUsers();
      let user = await business.getUser(userInfo.userId); 
      if ( // Check if the user is an admin
        user.user === userInfo.user &&
        user.password === userInfo.password &&
        userInfo.accountType === "admin"
      ) { 
        let msg; 
        msg = await flash.getFlash(sessionKey);
        
        // Render the admin page with the stations, users, and any flash messages
        res.render("admin", {layout: "adminlayout", stations: stations, user: users, users: user, msg: msg});
        await business.cancelToken(sessionKey);  // Cancel the CSRF token
        return;
      }
    } else {
      res.redirect("/login");
      return;
    }
  }
});

app.get("/admin/:username/set-location/:stationId", async (req, res) => {
  const username = req.params.username; 
  const stationId = req.params.stationId;
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login"); 
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data;
      let stations = await business.readStations();
      let users = await business.readUsers();
      let user = await business.getUser(userInfo.userId);
      if (
        user.user === userInfo.user &&
        user.password === userInfo.password &&
        userInfo.accountType === "admin" 
      ) { 
        const csrfToken = await business.generateFormToken(sessionKey); // Generate a CSRF token
        res.render("set-location", {layout: "adminlayout", stationId: stationId, user: users, users: user, csrfToken: csrfToken }); // Render the set location page
        return;
      }
    } else {
      res.redirect("/login");
      return;
    }
  }
});

app.post("/admin/:username/set-location/:stationId", async (req, res) => {
  const users = await business.readUsers();
  const username = req.params.username;
  const sessionKey = req.cookies.session;
  const stationId = req.params.stationId;
  const { location } = req.body;

  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session || session.csrfToken === req.body.csrfToken) {  // Validate the CSRF token
      // Call the business layer function to set the location
      const result = await business.setStationLocation(stationId, location);
      await business.cancelToken(sessionKey);  // Cancel the CSRF token

      // Handle the result and respond accordingly
      if (result.success) {
        await flash.setFlash(req.cookies.session, "Location updated successfully!");
      } else {
        await flash.setFlash(req.cookies.session, "Failed to update location.");
      }
    }
    else {
      res.status(403).send('Invalid CSRF token'); // Send a 403 Forbidden response if the CSRF token is invalid
    }
  } 
  res.redirect(`/admin/${username}`);
});
 
app.get("/admin/:username/update-fuel-price/:stationId", async (req, res) => { // Display the update fuel price page
  const username = req.params.username;
  const stationId = req.params.stationId;
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data;
      let stations = await business.readStations();
      let users = await business.readUsers();
      let user = await business.getUser(userInfo.userId);
      if (
        user.user === userInfo.user &&
        user.password === userInfo.password &&
        userInfo.accountType === "admin"
      ) {
        const csrfToken = await business.generateFormToken(sessionKey);
        res.render("update-fuel-price", {
          layout: "adminlayout",
          stationId: stationId,
          user: users,
          users: user,
          csrfToken: csrfToken
        });
        return;
      }
    } else {
      res.redirect("/login");
      return;
    }
  }
});

app.post("/admin/:username/update-fuel-price/:stationId", async (req, res) => {
  const username = req.params.username;
  const stationId = Number(req.params.stationId);
  const { fuelType, fuelPrice } = req.body;
  const sessionKey = req.cookies.session;

  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session || session.csrfToken === req.body.csrfToken) {  // Validate the CSRF token
      // Update the fuel prices in the database based on the selected fuel type
      if (fuelType === "premium") {
        await business.updatePremiumFuelPrice(stationId, fuelPrice);
      } else if (fuelType === "super") {
        await business.updateSuperFuelPrice(stationId, fuelPrice);
      }

      await business.cancelToken(sessionKey);  // Cancel the CSRF token

      if (fuelType === "premium") {
        await flash.setFlash(req.cookies.session, "Premium fuel price updated successfully!");
      } else if (fuelType === "super") {
        await flash.setFlash(req.cookies.session, "Super fuel price updated successfully!");
      }

    }
    else {
      res.status(403).send('Invalid CSRF token');
    }
  }

  res.redirect(`/admin/${username}`);
});

app.get("/admin/:username/delete-station/:stationId", async (req, res) => { // Display the delete station page
  const username = req.params.username;
  const stationId = req.params.stationId;

  const result = await business.deleteStation(stationId);

  // Handle the result and respond accordingly
  if (result.success) {
    await flash.setFlash(req.cookies.session, "Station deleted successfully!");
  } else {
    await flash.setFlash(req.cookies.session, "Failed to delete station.");
  }

  res.redirect(`/admin/${username}`);
});

app.get("/admin/:username/rename-station/:stationId", async (req, res) => { // Display the rename station page
  const stationId = req.params.stationId;
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data;
      let stations = await business.readStations();
      let users = await business.readUsers();
      let user = await business.getUser(userInfo.userId);
      if (
        user.user === userInfo.user &&
        user.password === userInfo.password &&
        userInfo.accountType === "admin"
      ) {
        const csrfToken = await business.generateFormToken(sessionKey);
        res.render("rename-station", {
          layout: "adminlayout",
          stationId: stationId, 
          user: users,
          users: user,
          csrfToken: csrfToken
        });
        return;
      }
    } else {
      res.redirect("/login");
      return;
    }
  }
});

app.post("/admin/:username/rename-station/:stationId", async (req, res) => {
  const username = req.params.username;
  const stationId = req.params.stationId;
  const { name } = req.body;
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session || session.csrfToken === req.body.csrfToken) {  // Validate the CSRF token
      await business.updateStationName(stationId, name);

      await business.cancelToken(sessionKey);  // Cancel the CSRF token

      await flash.setFlash(req.cookies.session, "Station renamed successfully!");
    }
    else {
      res.status(403).send('Invalid CSRF token');
    }
  }  

  res.redirect(`/admin/${username}`);
});

app.get("/admin/:username/add-station", async (req, res) => {
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data;
      let stations = await business.readStations();
      let users = await business.readUsers();
      let user = await business.getUser(userInfo.userId);
      if (
        user.user === userInfo.user &&
        user.password === userInfo.password &&
        userInfo.accountType === "admin"
      ) {
        const csrfToken = await business.generateFormToken(sessionKey);
        res.render("add-station", {
          layout: "adminlayout",
          stations: stations,
          user: users,
          users: user,
          csrfToken: csrfToken
        });
        return;
      }
    } else {
      res.redirect("/login");
      return;
    }
  }
});

app.post("/admin/:username/add-station", async (req, res) => {
  const username = req.params.username;
  const {
    name,
    location,
    fuelPricePremium,
    fuelPriceSuper,
    currentFuelLevelsPremium,
    currentFuelLevelsSuper,
  } = req.body;

  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session || session.csrfToken === req.body.csrfToken) {  // Validate the CSRF token
      // Add the station to the database
      await business.addStation(
        name,
        location,
        fuelPricePremium,
        fuelPriceSuper,
        currentFuelLevelsPremium,
        currentFuelLevelsSuper
      );
      await business.cancelToken(sessionKey);  // Cancel the CSRF token

      await flash.setFlash(req.cookies.session, "Station added successfully!");
    }
    else {
      res.status(403).send('Invalid CSRF token');
    }
  }
  res.redirect(`/admin/${username}`);
});

// Users
app.get("/admin/:username/update-station/:userId", async (req, res) => {
  const userId = req.params.userId; 
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data;
      let stations = await business.readStations();
      let users = await business.readUsers();
      let user = await business.getUser(userInfo.userId);
      if (
        user.user === userInfo.user &&
        user.password === userInfo.password &&
        userInfo.accountType === "admin"
      ) {
        const csrfToken = await business.generateFormToken(sessionKey);
        res.render("update-station", {
          layout: "adminlayout",
          userId: userId,
          user: users,
          users: user,
          csrfToken: csrfToken
        });
        return;
      }
    } else {
      res.redirect("/login");
      return;
    }
  }
});

app.post("/admin/:username/update-station/:userId", async (req, res) => {
  const username = req.params.username;
  const userId = req.params.userId;
  const { stationId } = req.body;

  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session || session.csrfToken === req.body.csrfToken) {  // Validate the CSRF token
      // Update the stationId in the database
      const result = await business.updateUserStation(userId, stationId);

      await business.cancelToken(sessionKey);  // Cancel the CSRF token

      // Set a flash message based on the result
      if (result) {
        await flash.setFlash(req.cookies.session, "Station ID updated successfully!");
      } else {
        await flash.setFlash(req.cookies.session, "Failed to update station ID.");
      }
    }
    else {
      res.status(403).send('Invalid CSRF token');
    }
  }

  res.redirect(`/admin/${username}`);
});

app.get("/admin/:username/delete-user/:userId", async (req, res) => {
  const username = req.params.username;
  let users = await business.readUsers();
  let userId = req.params.userId;

  // Delete the user from the database
  const result = await business.removeUser(userId);

  // Set a flash message based on the result
  if (result) {
    await flash.setFlash(req.cookies.session, "User deleted successfully!");
  } else {
    await flash.setFlash(req.cookies.session, "Failed to delete user.");
  }

  res.redirect(`/admin/${username}`);
});

app.get("/admin/:username/add-user", async (req, res) => {
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data;
      let stations = await business.readStations();
      let users = await business.readUsers();
      let user = await business.getUser(userInfo.userId);
      if (
        user.user === userInfo.user &&
        user.password === userInfo.password &&
        userInfo.accountType === "admin"
      ) {
        const csrfToken = await business.generateFormToken(sessionKey);
        res.render("add-user", {
          layout: "adminlayout",
          stations: stations,
          user: users,
          users: user,
          csrfToken: csrfToken
        });
        return;
      }
    } else {
      res.redirect("/login");
      return;
    }
  }
});

app.post("/admin/:username/add-user", async (req, res) => {
  const user = req.params.username;
  const { username, password, accountType } = req.body;

  // Hash the entered password
  const hash = crypto.createHash('sha256');
  hash.update(password);
  const hashedPassword = hash.digest('hex');

  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session || session.csrfToken === req.body.csrfToken) {  // Validate the CSRF token
      // Add the user to the database
      await business.createUser(username, hashedPassword, accountType);

      await business.cancelToken(sessionKey);  // Cancel the CSRF token

      await flash.setFlash(req.cookies.session, "User added successfully!");
    }
    else {
      res.status(403).send('Invalid CSRF token');
    }
  }

  res.redirect(`/admin/${user}`);
});


// ADMIN PROFILE MANAGEMENT
app.get("/admin/:username/profile", async (req, res) => {
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data;
      let users = await business.readUsers();
      let user = await business.getUser(userInfo.userId);
      let msg;
      msg = await flash.getFlash(sessionKey);
      res.render("admin-profile", {layout: "adminlayout",user: users, users: user, msg: msg });
    }
  }
});

app.post("/admin/:username/upload-file", async (req, res) => {
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/?message=You must be logged in to see that page"); // Redirect the user to the login page if they are not logged in
    return;
  }
  const session = await business.getSession(sessionKey);
  if (!session) {
    res.redirect("/?message=You must be logged in to see that page"); 
    return;
  }
  let username = session.data.username;
  let file = req.files.submission;  // Retrieve the file from the request
  let fileName = `${username}.png`;  // Construct the file name using the username

  let filePath = path.join(
    __dirname,
    "static",
    "assets",
    "img",
    "avatars",
    fileName
  );   // Construct the file path

  
  let resizedImage = await sharp(file.data) // Resize the image to 150x150
  .resize(150, 150)
  .toBuffer();

  // Save the resized image
  await fs.promises.writeFile(filePath, resizedImage);

  // Send a response with a meta refresh tag to redirect the user to their profile page after 3 seconds
  res.send(`
      <head>
          <meta http-equiv="refresh" content="3; URL='/admin/${username}/profile'" />
      </head>
      <body>
          Profile picture uploaded successfully!
      </body>
  `);
});

app.post("/admin/:username/profile", async (req, res) => {
  const { username } = req.params;
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
      const session = await business.getSession(sessionKey);
      if (session) {
        const userInfo = session.data;
        const { username, password } = req.body;

        // Hash the new password
        const hash = crypto.createHash('sha256');
        hash.update(password);
        const hashedPassword = hash.digest('hex');

        // Update the user with the new username and hashed password
        await business.updateUser(userInfo.userId, { username, password: hashedPassword });
        // Update only the username and password in the session data
        session.data.username = username;
        session.data.password = hashedPassword;
        await business.updateSession(sessionKey, session);

        await flash.setFlash(req.cookies.session, "Password updated successfully!");
        res.redirect(`/admin/${username}/profile`);
      }
  }
});


// MANAGER VIEW
app.get("/manager/:username", async (req, res) => {
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data; // Retrieve the user info from the session data
      let user = await business.getUser(userInfo.userId); // Retrieve the user from the database using the user ID from the session data
      if (
        user.user === userInfo.user &&
        user.password === userInfo.password &&
        userInfo.accountType === "manager" // Check if the user is a manager
      ) {
        const stationId = user.stationId;
        const stations = await business.readStations();
        const station = stations.find((s) => s.stationId === stationId); // Retrieve the station from the database using the station ID from the user

        // Retrieve the data for the chart
        let data1 = await business.getData1(stationId); 
        
        // Prepare data for the chart
        let labels = data1.premium.map((record) => record.date); // Use the dates as labels
        let premiumData = data1.premium.map((record) => record.sales);
        let superData = data1.super.map((record) => record.sales); 
        let premiumBackgroundColors = premiumData.map(() => 'blue'); 
        let superBackgroundColors = superData.map(() => 'red'); 

        let chartData = { // Construct the chart data
          labels: labels, // Set the labels
          datasets: [ 
            {
              label: 'Premium Fuel Level', 
              data: premiumData, 
              backgroundColor: premiumBackgroundColors 
            },
            {
              label: 'Super Fuel Level',
              data: superData,
              backgroundColor: superBackgroundColors
            }
          ]
        };


        if (station) {
          let msg;
          msg = await flash.getFlash(sessionKey); 
          res.render("manager", {
            station: station,
            users: user,
            chartData: JSON.stringify(chartData),
            helpers: { formatLevel },
            msg: msg
          });

          await business.cancelToken(sessionKey);  // Cancel the CSRF token

        } else {
          res.status(404).send("Station not found"); 
        }
      } else {
        res.status(404).send("Manager not found");
      }
    } else {
      res.redirect("/login");
      return;
    }
  }
});

app.get("/manager/:username/fuel-delivery", async (req, res) => {
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data;
      let user = await business.getUser(userInfo.userId);
      const stations = await business.readStations();
      const station = stations.find((s) => s.userId === user.userId);
      if (station) {
        const csrfToken = await business.generateFormToken(sessionKey);
        res.render("fuel-delivery", { station: station, users: user, csrfToken: csrfToken });
      } else {
        res.status(404).send("Station not found");
      }
    } else {
      res.redirect("/login");
      return;
    }
  }
});

app.post("/manager/:username/fuel-delivery", async (req, res) => {
  const username = req.params.username;
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session || session.csrfToken === req.body.csrfToken) { // Validate the CSRF token
      const userInfo = session.data; 
      let user = await business.getUser(userInfo.userId);
      const stations = await business.readStations();
      const station = stations.find((s) => s.userId === user.userId); // Retrieve the station from the database using the user ID from the session data
      const fuelType = req.body.fuelType; 
      const fuelAmount = Number(req.body.fuelAmount);
      if (fuelType === "premium") {
        await business.updatePremiumFuelLevel(station.stationId, fuelAmount);
      } else if (fuelType === "super") {
        await business.updateSuperFuelLevel(station.stationId, fuelAmount);
      }

      // Extract the date from the form
      const enteredDate = req.body.date;

      // Use the user's ID and station ID when recording fuel delivery
      const result = await business.recordFuelDelivery(
        userInfo.userId,
        station.stationId,
        fuelType,
        fuelAmount,
        enteredDate // Pass enteredDate to the business layer
      );
      
      if (result.success) {
        await flash.setFlash(req.cookies.session, "Fuel delivery recorded successfully!");
      } else {
        await flash.setFlash(req.cookies.session, "Failed to record fuel delivery.");
      }
      await business.cancelToken(sessionKey);  // Cancel the CSRF token

      res.redirect(`/manager/${username}`);
    }
    else {
      res.status(403).send('Invalid CSRF token');
    }
  }
});

app.get("/manager/:username/daily-sales", async (req, res) => {
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data;
      let user = await business.getUser(userInfo.userId);
      const stations = await business.readStations();
      const station = stations.find((s) => s.userId === user.userId);
      if (station) {
        const csrfToken = await business.generateFormToken(sessionKey);
        res.render("daily-sales", { station: station, users: user, csrfToken: csrfToken }); // Render the daily sales page
      } else {
        res.status(404).send("Station not found");
      }
    } else {
      res.redirect("/login");
      return;
    }
  }
});

app.post("/manager/:username/daily-sales", async (req, res) => {
  const username = req.params.username;
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session || session.csrfToken === req.body.csrfToken) {
      const userInfo = session.data;
      let user = await business.getUser(userInfo.userId);
      const stations = await business.readStations();
      const station = stations.find((s) => s.userId === user.userId);
      const date = req.body.date; 
      const salesTotal = Number(req.body.salesTotal); 
      const fuelType = req.body.fuelType; 

      // Use the function to record sales and fuel availability
      const result = await business.recordSalesAndFuelAvailability(
        userInfo.userId,
        station.stationId,
        date,
        salesTotal,
        fuelType
      );

      // Retrieve the records from the database
      const records = await business.readRecords();

      // Find the record with the current date, station ID, and fuel type
      const currentRecord = records.find(
        (r) =>
          r.stationId === station.stationId &&
          r.date === date &&
          r.fuelType === fuelType
      );

      // If the record is found, get the litersSold
      if (currentRecord) {
        const litersSold = currentRecord.litersSold;
        if (fuelType === "premium") {
          await business.deductPremiumFuelLevel(station.stationId, litersSold);
        } else if (fuelType === "super") {
          await business.deductSuperFuelLevel(station.stationId, litersSold);
        }
      }

      if (result.success) {
        await flash.setFlash(req.cookies.session, "Daily sales recorded successfully!");
      } else {
        await flash.setFlash(req.cookies.session, "Failed to record daily sales.");
      }
      await business.cancelToken(sessionKey);  // Cancel the CSRF token

      res.redirect(`/manager/${username}`);
    }
  }
});


// MANAGER PROFILE MANAGEMENT
app.get("/manager/:username/profile", async (req, res) => {
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session) {
      const userInfo = session.data;
      let user = await business.getUser(userInfo.userId);
      const csrfToken = await business.generateFormToken(sessionKey);
      let msg;
      msg = await flash.getFlash(sessionKey);
      res.render("manager-profile", { users: user, csrfToken: csrfToken, msg: msg });
    }
  }
});

app.post("/manager/:username/upload-file", async (req, res) => {
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/?message=You must be logged in to see that page");
    return;
  }
  const session = await business.getSession(sessionKey);
  if (!session || !session.csrfToken === req.body.csrfToken) {
    res.redirect("/?message=You must be logged in to see that page");
    return;
  }
  let username = session.data.username; 
  let file = req.files.submission;  // Retrieve the file from the request
  let fileName = `${username}.png`; // Construct the file name using the username
  let filePath = path.join(
    __dirname, 
    "static", 
    "assets",
    "img",
    "avatars",
    fileName
  ); // Construct the file path

  // Resize the image
  let resizedImage = await sharp(file.data).resize(150, 150).toBuffer();

  // Save the resized image
  await fs.promises.writeFile(filePath, resizedImage);
  await business.cancelToken(sessionKey);  // Cancel the CSRF token

  res.send(`
      <head>
          <meta http-equiv="refresh" content="3; URL='/manager/${username}'" />
      </head>
      <body>
          Profile picture uploaded successfully!
      </body>
  `);
});

app.post("/manager/:username/profile", async (req, res) => {
  const { username } = req.params;
  const sessionKey = req.cookies.session;
  if (!sessionKey) {
    res.redirect("/login");
  } else {
    const session = await business.getSession(sessionKey);
    if (session || session.csrfToken === req.body.csrfToken) {
      const userInfo = session.data;
      const { username, password } = req.body;

      // Hash the new password
      const hash = crypto.createHash('sha256');
      hash.update(password);
      const hashedPassword = hash.digest('hex');

      // Update the user with the new username and hashed password
      await business.updateUser(userInfo.userId, { username, password: hashedPassword });

      // Update only the username and password in the session data
      session.data.username = username;
      session.data.password = hashedPassword;
      await business.updateSession(sessionKey, session);

      await business.cancelToken(sessionKey);  // Cancel the CSRF token
      await flash.setFlash(req.cookies.session, "Password updated successfully!");
      res.redirect(`/manager/${username}`);
    }
  }
});


// PUBLIC VIEW
app.get("/public", async (req, res) => {
  let stations = await business.readStations();
  
  // Define the low fuel level threshold
  const lowFuelLevel = 5000; // 5000 liters

  // Prepare data for the chart
  let labels = []; 
  let premiumData = []; 
  let superData = []; 
  let premiumBackgroundColors = []; 
  let superBackgroundColors = [];

  // Check each station's fuel level and add a message if it's low
  for (let station of stations) {
    labels.push(station.location);
    premiumData.push(station.currentFuelLevels.premium); 
    superData.push(station.currentFuelLevels.super); 
    
    // Change bar color to red if fuel level is low
    premiumBackgroundColors.push(station.currentFuelLevels.premium < lowFuelLevel ? 'red' : 'green'); 
    superBackgroundColors.push(station.currentFuelLevels.super < lowFuelLevel ? 'red' : 'green');
  }

  let chartData = { 
    labels: labels,
    datasets: [
      {
        label: 'Premium Fuel Level',
        data: premiumData,
        backgroundColor: premiumBackgroundColors
      },
      {
        label: 'Super Fuel Level',
        data: superData,
        backgroundColor: superBackgroundColors
      }
    ]
  };

  res.render("public", { layout: "publiclayout", stations: stations, chartData: JSON.stringify(chartData), helpers: { formatLevel, incrementIndex }});
});

app.get('/contactUs', (req, res) => {
  res.render('contactUs', {layout: "publiclayout"}); // Render the contact us page
})

app.listen(9000, () => {
  console.log("Server running on port 9000");
});