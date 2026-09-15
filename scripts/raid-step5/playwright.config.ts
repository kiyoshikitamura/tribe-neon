import config from '../../playwright.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...config,testDir:'../../tests/e2e',use:{...config.use,baseURL:'http://localhost:3017'},webServer:undefined});
