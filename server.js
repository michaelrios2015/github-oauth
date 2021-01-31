//for deployment because we can't send this without reliving the secrets
try {
    const env = require('./env');
    process.env.client_id = env.client_id;
    process.env.client_secret = env.client_secret;
}
catch(ex){
    console.log(ex);
    console.log('YOU NEED ENVIORMENTS');
}
// console.log(process.env.client_id, process.env.client_secret);
//out database now with jwt to make it so only you can log into the account
//also for some reason SSL had to  be turned off in deployment...IDK
const Sequelize = require('sequelize')
const jwt = require('jsonwebtoken');
const { STRING, UUID, UUIDV4, JSON } = Sequelize;
const conn = new Sequelize(process.env.DATABASE_URL || 'postgres://postgres:JerryPine@localhost/acme_db');

//normal
const User = conn.define('user', {
    id: {
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4
    },
    username: {
        type: STRING,
        allowNull: false,
        unique: true
    },
    github: {
        type: JSON
    }
})

//ejs lets us put some html in here??
const ejs = require('ejs');
const axios = require('axios');
const express = require('express');
const app = express();
app.engine('html', ejs.renderFile);
const path = require('path');

//regular index
app.get('/', (req, res, next)=> res.render(path.join(__dirname, 'index.html'), { client_id: process.env.client_id }));

//so this is getting a user but just with JWT so we are done with github authorization
app.get('/api/auth', async (req, res, next)=> {
    try {
        const { id } = await jwt.verify(req.headers.authorization, process.env.JWT)
        const user = await User.findByPk(id);
        if(!user){
            const error = Error('bad credentials');
            error.status = 401;
            throw error
        }
        res.send(user);
    } catch(ex){
        next(ex);
    }
})

//This is where the bulk of the work is done 
app.get('/github/callback', async(req, res, next) => {
    try{
        //I assume this comes first and we post a request to github
        //button is pressed on index.html we are sent to github github gives us a code and
        //this starts 
        let response = await axios.post('https://github.com/login/oauth/access_token', {
            //essentially magic
            code: req.query.code,
            client_id: process.env.client_id,
            client_secret: process.env.client_secret
        }, {
            headers:{
                accept: 'application/json'
            }
        })
        //we get a response
        const data = response.data;
        //something went wrong with the response
        if(data.error){
            const error = Error(data.error);
            error.status = 401;
            throw error
        }
        //we get the response again?? not sure
        response = await axios.get('https://api.github.com/user', {
            headers: {
                authorization: `token ${ data.access_token }`
            }
        })
        //at this point we have gotten a user from github
        const { login, ...github } = response.data;
        //we already have the so we find them
        let user = await User.findOne({
            where: {
                username: login
            }
        })
        //we don't have the user so we make the user
        if(!user){
            user = await User.create({ username: login, github })
        }
        else {
            //picks up github update??
            await user.update({ github });
        }

        //I think this is everything from the last lecture using a token instead of 
        //an id so only the login patron can get the info or something
        const jwToken = jwt.sign({ id: user.id }, process.env.JWT);
        console.log(jwToken);
        res.send(`
            <html>
                <head>
                    <script>
                        window.localStorage.setItem('token', '${ jwToken }');
                        window.document.location = '/';
                    </script>
                </head> 
            </html>
        `);
        // res.send(user);

    } 
    catch(ex){
        next(ex)
    } 
})

app.use((err, req, res, next)=> {
    console.log(err);
    res.status(err.status).send({ error: err.message});
})

const init = async()=> {
    try{
        await conn.sync({ force: true });
        const port = process.env.PORT || 3000;
        app.listen(port, ()=> console.log(`listening on port ${port}`))
    }
    catch(ex){
        console.log(ex)
    }
}

init();