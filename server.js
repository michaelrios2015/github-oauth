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
const Sequelize = require('sequelize')
const jwt = require('jsonwebtoken');
const { STRING, UUID, UUIDV4, JSON } = Sequelize;
const conn = new Sequelize(process.env.DATABASE_URL || 'postgres://postgres:JerryPine@localhost/acme_db');

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

const ejs = require('ejs');
const axios = require('axios');
const express = require('express');
const app = express();
app.engine('html', ejs.renderFile);
const path = require('path');


app.get('/', (req, res, next)=> res.render(path.join(__dirname, 'index.html'), { client_id: process.env.client_id }));

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

app.get('/github/callback', async(req, res, next) => {
    try{
        //I assume this comes first and we post a request to github
        //it comes first we are littlerly making a post request to github like we would normally to our own database??
        //except the post request gives use a token that we then use for the next axios call
        let response = await axios.post('https://github.com/login/oauth/access_token', {
            //essentially magic
            code: req.query.code,
            client_id: process.env.client_id,
            client_secret: process.env.client_secret
        }, {
            headers:{
                //this just makes it look nicer 
                accept: 'application/json'
            }
        })
        //we get a response with our token which we will use to get the user
        const data = response.data;
        //something went wrong with the response
        if(data.error){
            const error = Error(data.error);
            error.status = 401;
            throw error
        }
        //we get the response again?? not sure
        //so the post gave us the magic token and 
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


//catch all error guy at the end
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