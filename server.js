// server.js 
const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MySQL database 
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'CityWheelsPK',
  waitForConnections: true,
  connectionLimit: 10
});

async function executeQuery(sql, params = []) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(sql, params);
    return rows;
  } finally {
    conn.release();
  }
}

// Home
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

//Driver
app.post('/api/drivers', async (req, res) => {
  const { name, contactNo, status, schedule, rating, insuranceDocument, drivingLicenseNumber, preferredPaymentMethod } = req.body;
  try {
    const result = await executeQuery(
      `INSERT INTO Driver 
      (Name, ContactNumber, Status, Schedule, Rating, InsuranceDocument, DrivingLicenseNumber, PreferredPaymentMethod) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, contactNo, status, schedule, rating, insuranceDocument, drivingLicenseNumber, preferredPaymentMethod]
    );
    res.status(201).json({ driverId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add driver', details: err.message });
  }
});

//PASSENGER 
app.post('/api/passengers', async (req, res) => {
  const { name, contactNo, email, paymentDetails } = req.body;
  try {
    const result = await executeQuery(
      'INSERT INTO Passenger (Name, ContactNo, Email, PaymentDetails) VALUES (?, ?, ?, ?)',
      [name, contactNo, email, paymentDetails]
    );
    res.status(201).json({ passengerId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add passenger', details: err.message });
  }
});

//VEHICLE
app.post('/api/vehicles', async (req, res) => {
    console.log('Vehicle registration request:', req.body);
    
 
    const {
        driverID,
        make,
        licensePlate,
        color,
        vehicleType,
        insurancePolicyNumber,
        childSeatAvailable,
        capacity
    } = req.body;

   
    if (!driverID || !make || !licensePlate || !color || !insurancePolicyNumber || !capacity) {
        console.log('Missing fields:', {
            driverID: !driverID,
            make: !make,
            licensePlate: !licensePlate,
            color: !color,
            insurancePolicyNumber: !insurancePolicyNumber,
            capacity: !capacity
        });
        return res.status(400).json({
            success: false,
            error: 'Missing required fields',
            details: {
                missing: {
                    driverID: !driverID,
                    make: !make,
                    licensePlate: !licensePlate,
                    color: !color,
                    insurancePolicyNumber: !insurancePolicyNumber,
                    capacity: !capacity
                }
            }
        });
    }

    try {
        
        const [driver] = await executeQuery(
            'SELECT DriverID FROM Driver WHERE DriverID = ?',
            [driverID]
        );

        if (!driver) {
            console.log('Driver not found:', driverID);
            return res.status(400).json({
                success: false,
                error: `Driver with ID ${driverID} not found`
            });
        }

        
        const [existingVehicle] = await executeQuery(
            'SELECT VehicleID FROM Vehicle WHERE LicensePlate = ?',
            [licensePlate]
        );

        if (existingVehicle) {
            return res.status(400).json({
                success: false,
                error: 'Vehicle with this license plate already exists'
            });
        }

        const result = await executeQuery(
            `INSERT INTO Vehicle 
            (Make, LicensePlate, Color, VehicleType, InsurancePolicyNumber, 
             ChildSeatAvailable, Capacity, Status, DriverID_FK)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Available', ?)`,
            [
                make,
                licensePlate,
                color,
                vehicleType || 'Car',
                insurancePolicyNumber,
                childSeatAvailable ? 1 : 0,
                capacity,
                driverID
            ]
        );

        console.log('Vehicle registered successfully:', result);
        return res.status(201).json({
            success: true,
            vehicleId: result.insertId,
            message: 'Vehicle registered successfully'
        });

    } catch (err) {
        console.error('Database error:', err);
        return res.status(500).json({
            success: false,
            error: 'Database operation failed',
            details: err.message
        });
    }
});


// RIDE 
app.post('/api/rides', async (req, res) => {
    console.log('Ride booking request:', req.body);
    
    try {
       
        const { pickUpLocation, dropOffLocation, passenger, driver, vehicle } = req.body;
        
        if (!pickUpLocation || !dropOffLocation || !passenger || !driver || !vehicle) {
            console.log('Missing fields:', {
                pickUpLocation: !pickUpLocation,
                dropOffLocation: !dropOffLocation,
                passenger: !passenger,
                driver: !driver,
                vehicle: !vehicle
            });
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                details: {
                    missing: {
                        pickUpLocation: !pickUpLocation,
                        dropOffLocation: !dropOffLocation,
                        passenger: !passenger,
                        driver: !driver,
                        vehicle: !vehicle
                    }
                }
            });
        }

        const [vehicleData] = await executeQuery(
            `SELECT v.*, d.Name AS DriverName, d.Status AS DriverStatus
             FROM Vehicle v
             JOIN Driver d ON v.DriverID_FK = d.DriverID
             WHERE v.VehicleID = ? AND v.Status = 'Available'`,
            [vehicle]
        );
        
        if (!vehicleData) {
            console.log('Vehicle not found or not available:', vehicle);
            return res.status(400).json({
                success: false,
                error: 'Vehicle not found or not available'
            });
        }

        
        const [passengerData] = await executeQuery(
            'SELECT PassengerID FROM Passenger WHERE PassengerID = ?',
            [passenger]
        );

        if (!passengerData) {
            console.log('Passenger not found:', passenger);
            return res.status(400).json({
                success: false,
                error: 'Passenger not found'
            });
        }

        
        const baseFare = 100;
        const distanceFare = 10;
        const fare = baseFare + (distanceFare * 5);

        
        const conn = await pool.getConnection();
        await conn.beginTransaction();

        try {
           
            const [result] = await conn.execute(
                `INSERT INTO Ride 
                 (Fare, RideStatus, DropOffLocation, PickUpLocation, 
                  VehicleID_FK, PassengerID_FK, DriverID_FK)
                 VALUES (?, 'Pending', ?, ?, ?, ?, ?)`,
                [fare, dropOffLocation, pickUpLocation, vehicle, passenger, driver]
            );

          
            await conn.execute(
                `UPDATE Vehicle SET Status = 'Unavailable' WHERE VehicleID = ?`,
                [vehicle]
            );

            
            await conn.execute(
                `UPDATE Driver SET Status = 'Unavailable' WHERE DriverID = ?`,
                [driver]
            );

            await conn.commit();
            conn.release();
            
            console.log('Ride booked successfully:', {
                rideId: result.insertId,
                fare,
                driverName: vehicleData.DriverName,
                vehicleMake: vehicleData.Make
            });

            return res.json({
                success: true,
                rideId: result.insertId,
                fare: fare,
                driverName: vehicleData.DriverName,
                vehicleMake: vehicleData.Make,
                message: 'Ride booked successfully!'
            });

        } catch (err) {
            await conn.rollback();
            conn.release();
            throw err;
        }

    } catch (err) {
        console.error('Database error:', err);
        return res.status(500).json({
            success: false,
            error: 'Database error',
            details: err.message
        });
    }
});


// FEEDBACK
app.post('/api/feedback', async (req, res) => {
  const { rideId, fromUserId, toUserId, rating, comments } = req.body;
  try {
    const result = await executeQuery(
      `INSERT INTO FeedBack 
      (RideID_FK, FromUserID_FK, ToUserID_FK, Rating, Comments, Timestamp) 
      VALUES (?, ?, ?, ?, ?, NOW())`,
      [rideId, fromUserId, toUserId, rating, comments]
    );
    res.status(201).json({ feedbackId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit feedback', details: err.message });
  }
});



app.get('/api/rides-for-feedback', async (req, res) => {
  try {
    const rides = await executeQuery(
      `SELECT r.RideID, r.PickUpLocation, r.DropOffLocation, 
       p.Name AS PassengerName, d.Name AS DriverName
       FROM Ride r
       JOIN Passenger p ON r.PassengerID_FK = p.PassengerID
       JOIN Driver d ON r.DriverID_FK = d.DriverID
       WHERE r.RideStatus = 'Completed'
       ORDER BY r.RideID DESC`
    );
    res.json(rides);
  } catch (err) {
    console.error('Rides fetch error:', err);
    res.status(500).json({ error: 'Failed to load rides' });
  }
});


app.get('/api/passengers', async (req, res) => {
  try {
    const passengers = await executeQuery(
      'SELECT PassengerID, Name FROM Passenger ORDER BY Name'
    );
    res.json(passengers);
  } catch (err) {
    console.error('Passengers fetch error:', err);
    res.status(500).json({ error: 'Failed to load passengers' });
  }
});


app.get('/api/drivers', async (req, res) => {
  try {
    const drivers = await executeQuery(
      'SELECT DriverID, Name FROM Driver ORDER BY Name'
    );
    res.json(drivers);
  } catch (err) {
    console.error('Drivers fetch error:', err);
    res.status(500).json({ error: 'Failed to load drivers' });
  }
});

// MAINTENANCE
app.post('/api/maintenance', async (req, res) => {
  const { vehicleId, performedBy, cost, description, date } = req.body;
  try {
    const result = await executeQuery(
      `INSERT INTO Maintenance 
      (VehicleID_FK, PerformedBy, Cost, Description, Date) 
      VALUES (?, ?, ?, ?, ?)`,
      [vehicleId, performedBy, cost, description, date]
    );
    res.status(201).json({ maintenanceId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log maintenance', details: err.message });
  }
});


//PAYMENT
app.post('/api/payments', async (req, res) => {
  console.log('Payment request received:', req.body);
  
  const { rideId, paymentMethod, amount, paymentStatus } = req.body;

  
  if (!rideId || !paymentMethod || !amount || !paymentStatus) {
    console.log('Missing payment fields:', {
      rideId: !rideId,
      paymentMethod: !paymentMethod,
      amount: !amount,
      paymentStatus: !paymentStatus
    });
    return res.status(400).json({
      success: false,
      error: 'Missing required fields',
      details: {
        missing: {
          rideId: !rideId,
          paymentMethod: !paymentMethod,
          amount: !amount,
          paymentStatus: !paymentStatus
        }
      }
    });
  }

  try {
    
    const [ride] = await executeQuery(
      'SELECT RideID, Fare FROM Ride WHERE RideID = ?',
      [rideId]
    );

    if (!ride) {
      console.log('Ride not found:', rideId);
      return res.status(400).json({
        success: false,
        error: `Ride with ID ${rideId} not found`
      });
    }

    
    const [existingPayment] = await executeQuery(
      'SELECT PaymentID FROM Payment WHERE RideID_FK = ?',
      [rideId]
    );

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        error: 'Payment already exists for this ride'
      });
    }

    const result = await executeQuery(
      `INSERT INTO Payment 
      (RideID_FK, PaymentMethod, Amount, PaymentStatus, TransactionDate) 
      VALUES (?, ?, ?, ?, CURDATE())`,
      [rideId, paymentMethod, amount, paymentStatus]
    );

   
    if (paymentStatus === 'Completed') {
      await executeQuery(
        'UPDATE Ride SET RideStatus = "Completed" WHERE RideID = ?',
        [rideId]
      );
    }

    console.log('Payment recorded successfully:', result);
    return res.status(201).json({
      success: true,
      paymentId: result.insertId,
      message: 'Payment recorded successfully'
    });

  } catch (err) {
    console.error('Payment error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to record payment',
      details: err.message
    });
  }
});



//PROMOTION 
app.post('/api/promotions', async (req, res) => {
  const { 
    code,           
    description,    
    criteria,       
    expiry,         
    discount       
  } = req.body;

  try {
    const result = await executeQuery(
      `INSERT INTO Promotion 
      (PromoCode, Description, EligibilityCriteria, ExpiryDate, DiscountAmount) 
      VALUES (?, ?, ?, ?, ?)`,
      [code, description, criteria, expiry, discount]
    );
    res.status(201).json({ success: true, promotionId: result.insertId });
  } catch (err) {
    console.error('Promotion creation error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add promotion',
      details: err.sqlMessage || err.message
    });
  }
});
//SUPPORT
app.post('/api/support', async (req, res) => {
  const { rideId, passengerId, issueDescription } = req.body;
  try {
    const result = await executeQuery(
      `INSERT INTO SupportRequest 
      (RideID_FK, PassengerID_FK, IssueDescription, DateSubmitted, ResolutionStatus) 
      VALUES (?, ?, ?, NOW(), 'Pending')`,
      [rideId, passengerId, issueDescription]
    );
    res.status(201).json({ requestId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit request', details: err.message });
  }
});



const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));