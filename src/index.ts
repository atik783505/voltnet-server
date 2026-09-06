import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;
if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
}
const client = new MongoClient(uri);

async function run() {
    try {
        // Connect to MongoDB
        // await client.connect();

        const database = client.db('voltnet');
        const stationCollection = database.collection('station')
        const stationBookingCollection = database.collection('stationBooking');
        const transactionCollection = database.collection('transactions');
        const usersCollection = database.collection('user');

        console.log("Connected successfully to MongoDB");

        app.post('/api/stations', async (req: Request, res: Response) => {
            try {
                const stationData = req.body;
                if (!stationData.name || !stationData.location) {
                    return res.status(400).json({ success: false, message: "Name and Location are required" });
                }
                const result = await stationCollection.insertOne({
                    ...stationData,
                    images: stationData.images || [], // Multiple images
                    pricing: Number(stationData.pricing), // Price per kWh or hour
                    powerOutput: Number(stationData.powerOutput), // kW
                    createdAt: new Date()
                });
                res.status(201).json({
                    success: true,
                    message: "Station added successfully",
                    insertedId: result.insertedId
                });
            } catch (error: any) {
                console.error("Error adding station:", error);
                res.status(500).json({ success: false, message: error.message });
            }
        });

        app.get('/api/stations', async (req: Request, res: Response) => {
            try {
                const { search, location, minPrice, maxPrice, sortBy, page } = req.query;
                const query: any = {};
                if (search) {
                    query.$or = [
                        { name: { $regex: search, $options: 'i' } },
                        { title: { $regex: search, $options: 'i' } }
                    ];
                }
                if (location) {
                    query.location = { $regex: location, $options: 'i' };
                }
                if (minPrice || maxPrice) {
                    query.pricing = {};
                    if (minPrice) query.pricing.$gte = Number(minPrice);
                    if (maxPrice) query.pricing.$lte = Number(maxPrice);
                }
                let sortOptions: any = { createdAt: -1 };
                if (sortBy === 'price_asc') {
                    sortOptions = { pricing: 1 };
                } else if (sortBy === 'price_desc') {
                    sortOptions = { pricing: -1 };
                } else if (sortBy === 'power_desc') {
                    sortOptions = { powerOutput: -1 };
                }
                const limit = 12;
                const currentPage = Number(page) || 1;
                const skip = (currentPage - 1) * limit;
                const totalStations = await stationCollection.countDocuments(query);
                const stations = await stationCollection
                    .find(query)
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(limit)
                    .toArray();
                res.send({
                    stations,
                    pagination: {
                        totalItems: totalStations,
                        totalPages: Math.ceil(totalStations / limit),
                        currentPage,
                        limit,
                    }
                });
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch stations", error });
            }
        });
        app.get('/api/stations/:id', async (req: Request, res: Response) => {
            try {
                const stationId = req.params.id;
                if (typeof stationId !== 'string' || !ObjectId.isValid(stationId)) {
                    return res.status(400).send({ message: "Invalid Station ID format" });
                }

                const station = await stationCollection.findOne({ _id: new ObjectId(stationId) });

                if (!station) {
                    return res.status(404).send({ message: "Station not found" });
                }

                res.send(station);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch station", error });
            }
        });
        // UPDATE Station API
        app.put('/api/stations/:id', async (req: Request, res: Response) => {
            try {
                const stationId = req.params.id;
                if (typeof stationId !== 'string' || !ObjectId.isValid(stationId)) {
                    return res.status(400).send({ message: "Invalid Station ID format" });
                }
                const updatedData = req.body;
                delete updatedData._id;

                const result = await stationCollection.updateOne(
                    { _id: new ObjectId(stationId) },
                    {
                        $set: {
                            ...updatedData,
                            pricing: Number(updatedData.pricing),
                            powerOutput: Number(updatedData.powerOutput),
                            updatedAt: new Date()
                        }
                    }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "Station not found" });
                }

                res.send({ success: true, message: "Station updated successfully" });
            } catch (error) {
                res.status(500).send({ message: "Failed to update station", error });
            }
        });

        // DELETE Station API
        app.delete('/api/stations/:id', async (req: Request, res: Response) => {
            try {
                const stationId = req.params.id;
                if (typeof stationId !== 'string' || !ObjectId.isValid(stationId)) {
                    return res.status(400).send({ message: "Invalid Station ID format" });
                }

                const result = await stationCollection.deleteOne({ _id: new ObjectId(stationId) });

                if (result.deletedCount === 0) {
                    return res.status(404).send({ message: "Station not found" });
                }

                res.send({ success: true, message: "Station deleted successfully" });
            } catch (error) {
                res.status(500).send({ message: "Failed to delete station", error });
            }
        });
        app.get('/api/users', async (req: Request, res: Response) => {
            try {
                const users = await usersCollection.find().toArray();
                res.send(users);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch users", error });
            }
        });
        app.patch('/api/users/:id/block', async (req: Request, res: Response) => {
            try {
                const userId = req.params.id;
                if (typeof userId !== 'string' || !ObjectId.isValid(userId)) {
                    return res.status(400).send({ success: false, message: "Invalid User ID format" });
                }

                const { isBlocked } = req.body;
                if (typeof isBlocked !== 'boolean') {
                    return res.status(400).send({ success: false, message: "isBlocked must be a boolean value" });
                }

                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(userId) },
                    {
                        $set: {
                            isBlocked: isBlocked,
                            updatedAt: new Date()
                        }
                    }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ success: false, message: "User not found" });
                }

                res.send({
                    success: true,
                    message: `User ${isBlocked ? "blocked" : "unblocked"} successfully`
                });
            } catch (error: any) {
                console.error("Error updating user status:", error);
                res.status(500).send({ success: false, message: "Failed to update user status", error: error.message });
            }
        });
        app.post('/api/bookings', async (req: Request, res: Response) => {
            try {
                const { userEmail, stationId, bookingDate, connectorType, duration, totalAmount, paymentMethod } = req.body;

                if (!userEmail || !stationId || !bookingDate || !connectorType || !duration) {
                    return res.status(400).json({ success: false, message: "Missing required details including duration." });
                }

                if (typeof stationId !== 'string' || !ObjectId.isValid(stationId)) {
                    return res.status(400).json({ success: false, message: "Invalid Station ID format." });
                }

                const transactionId = `TXN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

                // ১. বুকিং অবজেক্টে duration সেভ করা হচ্ছে
                const bookingDoc = {
                    userEmail,
                    stationId: new ObjectId(stationId),
                    bookingDate: new Date(bookingDate),
                    connectorType,
                    duration: Number(duration), // 👈 duration ডাটাবেজে যুক্ত হলো
                    energyDelivered: 0,
                    createdAt: new Date()
                };
                const bookingResult = await stationBookingCollection.insertOne(bookingDoc);
                const insertedBookingId = bookingResult.insertedId;

                const transactionDoc = {
                    bookingId: insertedBookingId,
                    userEmail,
                    stationId: new ObjectId(stationId),
                    transactionId,
                    amount: Number(totalAmount),
                    paymentStatus: "Paid",
                    paymentMethod: paymentMethod || "bKash",
                    createdAt: new Date()
                };
                await transactionCollection.insertOne(transactionDoc);

                res.status(201).json({
                    success: true,
                    message: "Booking and Transaction processed successfully.",
                    bookingId: insertedBookingId,
                    transactionId
                });
            } catch (error: any) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // GET Charging History API (Updated to project duration)
        app.get('/api/history/charging/:email', async (req: Request, res: Response) => {
            try {
                const email = req.params.email;
                const chargingHistory = await stationBookingCollection.aggregate([
                    { $match: { userEmail: email } },
                    {
                        $lookup: {
                            from: "station",
                            localField: "stationId",
                            foreignField: "_id",
                            as: "stationDetails"
                        }
                    },
                    { $unwind: "$stationDetails" },
                    { $sort: { bookingDate: -1 } },
                    {
                        $project: {
                            _id: 1,
                            bookingDate: 1,
                            connectorType: 1,
                            duration: 1,
                            energyDelivered: 1,
                            "stationDetails.name": 1,
                            "stationDetails.location": 1
                        }
                    }
                ]).toArray();

                res.status(200).json({ success: true, data: chargingHistory });
            } catch (error: any) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        app.get('/api/history/transactions/:email', async (req: Request, res: Response) => {
            try {
                const email = req.params.email;
                const transactionHistory = await transactionCollection.aggregate([
                    { $match: { userEmail: email } },
                    {
                        $lookup: {
                            from: "station",
                            localField: "stationId",
                            foreignField: "_id",
                            as: "stationDetails"
                        }
                    },
                    { $unwind: "$stationDetails" },
                    { $sort: { createdAt: -1 } },
                    {
                        $project: {
                            _id: 1,
                            transactionId: 1,
                            amount: 1,
                            paymentStatus: 1,
                            paymentMethod: 1,
                            createdAt: 1,
                            "stationDetails.name": 1
                        }
                    }
                ]).toArray();

                res.status(200).json({ success: true, data: transactionHistory });
            } catch (error: any) {
                res.status(500).json({ success: false, message: error.message });
            }
        });
        app.get('/', (req: Request, res: Response) => {
            res.send('TypeScript (CommonJS) Backend is Running!');
        });

    } catch (error) {
        console.error(error);
    }
}
run().catch(console.dir);

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running on port: ${port}`);
    });
}

export default app;