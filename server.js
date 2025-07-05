const express = require('express');
const cors = require('cors');
const mysql = require('mysql')

const app = express();
// Middleware
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root321',
  database: 'expense'

})
// for testing
const data = [{
  name: 'abdullah saifi',
  email: 'saifiabduldelhi@gmail.com'
}]

db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  }
  else {
    console.log('Connected to the mysql databse')
  }
})

app.get('/', (req, res) => {
  res.json(data)
  //res.send('Welcome to the expense tracker api')
})

// Register
app.post('/register', (req, res) => {
  const { name, username, email, password } = req.body;

  // Check if all fields are provided
  // if any field is missing like name, username,, return a 400 error
  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Check if user already exists
  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    //it will run when there is an error in the query
    if (err) {
      console.error('Error executing query:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (results.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Insert new user
    db.query(
      'INSERT INTO users (name, username, email, password) VALUES (?, ?, ?, ?)', [name, username, email, password],
      (err, result) => {
        if (err) {
          console.error('Error executing query:', err);
          return res.status(500).json({ error: 'Internal Server Error' });
        }

        const newUserId = result.insertId;// Get the ID from users table of the newly inserted user & set it to the userId of user_expenses
        //console.log(newUserId);
        // Insert default row in user_expenses
        db.query(
          `INSERT INTO user_expenses (userId, remaining_balance, total_credit_amount, total_debit_amount, credit_transactions, debit_transactions)
           VALUES (?, 0, 0, 0, '[]', '[]')`,
          [newUserId],
          (err2) => {
            if (err2) {
              console.error('Error initializing user_expenses:', err2);
              return res.status(500).json({ error: 'Failed to initialize user expenses' });
            }

            return res.status(201).json({
              //message: 'User registered successfully',
              //userId: newUserId
            });
          }
        );
      }
    );
  });
});

//login api
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
    if (err) {
      console.log('Error executing query:', err);
      res.status(500).json({ error: 'Inetrnal Server error' })
    }
    if (results.length > 0) {
      const user = results[0]
      //console.log('User found:', user);
      //give user identity
      res.status(200).json({
        message: 'Login successful', /*user: results[0],*/ user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email
        }
      })

    }
    else {
      res.status(401).json({ message: 'Invalid email or pasword' })
    }
  })
})
//dashboard api
app.get('/dashboard/:userID', (req, res) => {
  const userID = req.params.userID;

  db.query('SELECT * FROM user_expenses WHERE userID = ?', [userID], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    const userData = results[0];
    res.status(200).json({
      success: true,
      userDetails: {
        userId: userData.userID,
        //remaining_balance: userData.remaining_balance,
        //total_credit_amount: userData.total_credit_amount,
        //total_debit_amount: userData.total_debit_amount,
        credit_transactions: JSON.parse(userData.credit_transactions),
        debit_transactions: JSON.parse(userData.debit_transactions)
      }
    });
  });
});
// Routes
// Route to add expense/credit
app.post('/add-transaction/:userId', (req, res) => {
  //console.log('Add transaction endpoint hit');
  //console.log('Request body:', req.body);
  //console.log('Request params:', req.params);
  //console.log(title,amount);
  const userId = req.params.userId;
  const { title, amount } = req.body;

  // run when any input field is empty
  if (!title || amount === undefined) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const parsedAmount = parseFloat(amount);

  let query = '';
  if (parsedAmount > 0) {
    query = `
      UPDATE user_expenses
    SET 
      credit_transactions = JSON_ARRAY_APPEND(
        credit_transactions, '$', JSON_OBJECT("title", ?, "amount", ?)
      )
    WHERE userId = ?
  `;
  } else {
    const absAmount = Math.abs(parsedAmount);
    query = `
      UPDATE user_expenses
    SET 
      debit_transactions = JSON_ARRAY_APPEND(
        debit_transactions, '$', JSON_OBJECT("title", ?, "amount", ?)
      )
    WHERE userId = ?
  `;
  }

  const values = parsedAmount > 0
    ? [title, parsedAmount, userId]
    : [title, Math.abs(parsedAmount), userId];

  //console.log('values:', values);
  db.query(query, values, (err, results) => {
    if (err) {
      console.error('Error running query:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json({ success: true, message: 'Transaction added' });
  });
});

// 
app.post('/delete-transaction/:userId', (req, res) => {
  console.log('Delete trasaction endpoint hit')
  const userId = req.params.userId;
  const { type, index } = req.body; // type: 'credit' or 'debit'

  if (!['credit', 'debit'].includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid transaction type' });
  }

  db.query('SELECT * FROM user_expenses WHERE userID = ?', [userId], (err, results) => {
    //console.log([userId])
    if (err) return res.status(500).json({ success: false, error: 'DB error' });
    if (results.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    const user = results[0];
    //console.log('User found:', user.credit_transactions, user.debit_transactions);
    //store credit and debit transactions data in variables
    const creditTxns = JSON.parse(user.credit_transactions || '[]');
    const debitTxns = JSON.parse(user.debit_transactions || '[]');
    console.log('Credit transactions:', creditTxns);
    if (type === 'credit') {
      //console.log('Deleting credit transaction at index:', index);
      if (index < 0 || index >= creditTxns.length) return res.status(400).json({ success: false, message: 'Invalid credit index' });
      creditTxns.splice(index, 1);
    } else {
      if (index < 0 || index >= debitTxns.length) return res.status(400).json({ success: false, message: 'Invalid debit index' });
      debitTxns.splice(index, 1);
    }

    const query = `
      UPDATE user_expenses SET 
        credit_transactions = ?,
        debit_transactions = ?
      WHERE userID = ?
    `;
    
    db.query(
      query,
      [
        JSON.stringify(creditTxns),
        JSON.stringify(debitTxns),
        userId,
      ],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ success: false, error: 'Failed to update DB' });
        res.json({ success: true, message: 'Transaction deleted' });
      }
    );
  });
})

// DB connection
//connectDB();

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
