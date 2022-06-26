const express=require('express');
const router = express.Router();
postsController=require('../controllers/posts.controller');
router.get('/',postsController.posts);


module.exports=router;